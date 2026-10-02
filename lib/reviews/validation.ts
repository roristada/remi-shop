import { z } from "zod";
import { REVIEW_BODY_MAX } from "@/lib/reviews/rules";

// Messages are error codes mapped to `shop.reviews.errors.*` translation keys.
export const reviewInputSchema = z.object({
  productId: z.uuid(),
  rating: z.number().int().min(1, "rating").max(5, "rating"),
  // Optional: a star rating alone is a review.
  body: z.string().trim().max(REVIEW_BODY_MAX, "too_long").default(""),
  isAnonymous: z.boolean().default(false),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
