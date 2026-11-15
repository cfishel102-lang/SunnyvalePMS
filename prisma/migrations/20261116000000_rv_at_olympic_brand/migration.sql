-- The app's look used to be hard-coded to RV at Olympic. It is now stored per
-- property, so give the existing RV at Olympic property its brand.
UPDATE "Property"
SET brand = '{"colors":{"primary":"#636F56","accent":"#A36334","tint":"#C0C5AA","highlight":"#E3D370"},"fonts":{"heading":"Oswald","label":"Montserrat","body":"Nunito Sans"},"logo":"/brand/rv-at-olympic-logo-olive.png","logoOnDark":"/brand/rv-at-olympic-logo-sage.png"}'::jsonb
WHERE slug = 'rv-at-olympic' AND (brand IS NULL OR brand -> 'colors' IS NULL);
