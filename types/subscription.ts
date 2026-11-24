export interface SubscriptionOperations {
  // plan: which plan to buy with a new Stripe Checkout. Ignored for people who
  // already pay: they get the customer portal.
  manageSubscription: (
    accessToken: string,
    plan?: "premium" | "pro"
  ) => Promise<void>;
}

export type UseSubscriptionReturn = SubscriptionOperations;
