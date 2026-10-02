import type { SearchProviderType } from '@tbn/contracts';

/** A search provider row. The key is sealed. */
export interface SearchProviderRecord {
  id: string;
  owner_id: string;
  type: SearchProviderType;
  name: string;
  base_url: string;
  api_key_ciphertext: string | null;
  priority: number;
  enabled: boolean;
  price_per_thousand_requests: number | null;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a search provider is created or edited. */
export interface SearchProviderWrite {
  type: SearchProviderType;
  name: string;
  base_url: string;
  api_key_ciphertext: string | null;
  priority: number;
  enabled: boolean;
  price_per_thousand_requests: number | null;
}
