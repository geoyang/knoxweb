# Kizu Web - Admin Guide

## System-Wide Discount

The system-wide discount applies a percentage discount to all paid subscription plans. When enabled, it shows a banner on the subscription page and automatically applies the discount during Stripe checkout.

### How It Works

1. **Frontend Display**: A green banner shows the discount label and percentage
2. **Price Display**: Original prices show with strikethrough, discounted prices are highlighted
3. **Checkout**: The discount is automatically applied via a Stripe coupon
4. **Promo Codes**: User promo codes override the system discount (users get whichever is better)

### Configuration

The discount is stored in the `admin_config` table with key `system_discount`.

**Database Location**: `admin_config` table

**Schema**:
```sql
-- admin_config table structure
key: 'system_discount'
is_active: true
value: {
  "enabled": true,
  "percent": 20,
  "label": "Early Bird Discount",
  "description": "Save 20% during our launch period!",
  "stripe_coupon_id": "auto-generated",
  "valid_until": "2026-03-01T00:00:00Z"
}
```

### Setting Up a Discount

**Via SQL (Supabase SQL Editor)**:

```sql
-- Enable a 20% system-wide discount
INSERT INTO admin_config (key, value, is_active)
VALUES (
  'system_discount',
  '{
    "enabled": true,
    "percent": 20,
    "label": "Launch Special",
    "description": "Save 20% during our launch!"
  }'::jsonb,
  true
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  is_active = true,
  updated_at = NOW();
```

**To disable**:

```sql
UPDATE admin_config
SET value = jsonb_set(value, '{enabled}', 'false')
WHERE key = 'system_discount';

-- Or deactivate the entire config row:
UPDATE admin_config
SET is_active = false
WHERE key = 'system_discount';
```

**To change percentage**:

```sql
UPDATE admin_config
SET value = jsonb_set(
  jsonb_set(value, '{percent}', '15'),
  '{label}', '"15% Off"'
)
WHERE key = 'system_discount';
```

### Stripe Coupon

When a checkout occurs with a system discount:
1. The backend checks if `stripe_coupon_id` exists in the config
2. If not, it creates a new Stripe coupon with the discount percentage
3. The coupon ID is saved back to the database for reuse
4. The coupon is applied to the Stripe checkout session

### Notes

- The Stripe coupon is created automatically on first checkout
- Promo codes entered by users take precedence over system discounts
- Changes to the discount take effect immediately (no rebuild needed)
- The `valid_until` field is for display only; to truly expire, set `enabled: false`
