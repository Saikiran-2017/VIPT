-- Prompt 8: skeleton prediction_outcomes (pending evaluation fields nullable; predicted_price + weights stored at generation).

ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS predicted_price NUMERIC(12,2);
ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS model_weights_used JSONB;
ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS outcome_metadata JSONB;
ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS mape NUMERIC(12,6);
ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS direction_correct BOOLEAN;
ALTER TABLE prediction_outcomes ADD COLUMN IF NOT EXISTS check_date TIMESTAMPTZ;

ALTER TABLE prediction_outcomes ALTER COLUMN actual_price_amount DROP NOT NULL;
ALTER TABLE prediction_outcomes ALTER COLUMN was_accurate DROP NOT NULL;

ALTER TABLE prediction_outcomes ALTER COLUMN evaluated_at DROP NOT NULL;
ALTER TABLE prediction_outcomes ALTER COLUMN evaluated_at DROP DEFAULT;
