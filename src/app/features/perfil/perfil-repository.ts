import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

@Injectable({ providedIn: 'root' })
export class PerfilRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async load(userId: string): Promise<string | null> {
    if (!this.client) throw new Error('unconfigured');
    const { data, error } = await this.client.from('profiles')
      .select('display_name').eq('id', userId).maybeSingle();
    if (error || !data) throw new Error('load');
    return data.display_name as string | null;
  }

  async save(userId: string, displayName: string | null): Promise<string | null> {
    if (!this.client) throw new Error('unconfigured');
    const { data, error } = await this.client.from('profiles')
      .update({ display_name: displayName }).eq('id', userId)
      .select('display_name').maybeSingle();
    if (error || !data) throw new Error('save');
    return data.display_name as string | null;
  }
}
