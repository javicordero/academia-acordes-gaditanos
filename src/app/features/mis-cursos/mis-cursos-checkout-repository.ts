import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { CheckoutVerification, ORDER_UUID } from './mis-cursos-checkout';

interface OrderRow {
  id: string;
  status: string;
}
interface ItemRow {
  course_id: string;
}
interface RightRow {
  course_id: string;
}

/**
 * Contrasta el retorno de Stripe con nuestros propios datos. Es solo lectura:
 * la redirección de éxito no marca pedidos pagados, no concede derechos y no
 * escribe progreso. RLS limita las tres lecturas al usuario de la sesión;
 * además se filtra explícitamente por ese usuario y por el pedido de la URL.
 */
@Injectable({ providedIn: 'root' })
export class MisCursosCheckoutRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async verify(orderId: string, userId: string): Promise<CheckoutVerification> {
    if (!this.client || !ORDER_UUID.test(orderId) || !ORDER_UUID.test(userId)) {
      return { kind: 'notavailable' };
    }

    try {
      const { data: order, error: orderError } = await this.client
        .from('orders')
        .select('id,status')
        .eq('id', orderId)
        .eq('user_id', userId)
        .returns<OrderRow[]>()
        .maybeSingle();
      if (orderError) return { kind: 'error' };
      // Pedido ajeno, inexistente o borrado: una sola respuesta, sin revelar
      // si el identificador existe o a quién pertenece.
      if (!order) return { kind: 'notavailable' };

      const { data: items, error: itemsError } = await this.client
        .from('order_items')
        .select('course_id')
        .eq('order_id', orderId)
        .returns<ItemRow[]>();
      if (itemsError) return { kind: 'error' };
      // Varias líneas: se elige entre los cursos DE ESTE pedido el que tenga
      // derecho vigente; no el primero de un listado global ni el más reciente.
      const courseIds = [
        ...new Set(
          (items ?? [])
            .map((item) => item.course_id)
            .filter((id) => ORDER_UUID.test(id)),
        ),
      ].sort();
      if (!courseIds.length) return { kind: 'notavailable' };

      const { data: rights, error: rightsError } = await this.client
        .from('entitlements')
        .select('course_id')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .in('course_id', courseIds)
        .returns<RightRow[]>();
      if (rightsError) return { kind: 'error' };
      const active = new Set((rights ?? []).map((right) => right.course_id));

      if (order.status === 'pending') return { kind: 'pending' };
      if (order.status !== 'paid') return { kind: 'notavailable' };
      // El estado del pedido no basta: un derecho revocado o ausente no da
      // acceso aunque Stripe diga que el pago se completó.
      const courseId = courseIds.find((id) => active.has(id));
      return courseId ? { kind: 'confirmed', courseId } : { kind: 'notavailable' };
    } catch {
      return { kind: 'error' };
    }
  }
}
