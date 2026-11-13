export type PromotionPayload = {
  local_person_id: string;
  display_name: string;
  email: string;
  identity: { issuer: string; subject: string };
};
export interface PrimaryAdapter {
  createPerson(key: string, payload: PromotionPayload): Promise<unknown>;
  findByKey(key: string): Promise<unknown>;
}
// Implement only after the actual Cerebru contract is supplied. No inferred endpoint.
export class PrimaryPlatform implements PrimaryAdapter {
  async createPerson(_key: string, _payload: PromotionPayload): Promise<unknown> {
    throw new Error('primary_not_configured');
  }
  async findByKey(_key: string): Promise<unknown> {
    throw new Error('primary_not_configured');
  }
}
