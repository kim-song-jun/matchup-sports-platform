-- Remove unused Favorite and MarketplaceReview models
-- Neither model has any service/controller usage; dropping tables and FK columns.

-- Drop marketplace_reviews before marketplace_orders (FK dependency)
DROP TABLE IF EXISTS "marketplace_reviews";

-- Drop favorites
DROP TABLE IF EXISTS "favorites";
