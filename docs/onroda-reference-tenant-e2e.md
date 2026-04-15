# Onroda Reference Tenant E2E

This document records the validated reference tenant for fleet + access-code booking flows.

## Reference Tenant

- `company_id`: `co-b9d6d625-35dc-48c9-bb0f-b4e3342b2fdd`
- `name`: `test2`
- `company_kind`: `taxi`

## Required Configuration

- **Governance status**
  - `verification_status = verified`
  - `compliance_status = compliant`
  - `contract_status = active`
  - `is_blocked = false`
- **Modules**
  - `taxi_fleet`
  - `access_codes`
- **Limits**
  - `max_drivers >= 1`
  - `max_vehicles >= 1`
- **Required profile fields**
  - `legal_form`
  - `owner_name`
  - `tax_id`
  - `concession_number`
  - official address (`address_line1`, `postal_code`, `city`, `country`)
  - billing address (`billing_name`, `billing_address_line1`, `billing_postal_code`, `billing_city`, `billing_country`)
- **Required documents**
  - `compliance_gewerbe_storage_key` present
  - `compliance_insurance_storage_key` present
- **Policy payloads**
  - `fare_permissions` must allow voucher booking (`voucher = true`)
  - `insurer_permissions` must allow insurance booking if medical/insurance flow is used (`book = true`)
  - `area_assignments`: when configured (non-empty), route endpoints must match assigned area terms

## E2E Test Steps

1. Partner login succeeds (`/api/panel-auth/login`).
2. Fleet driver creation succeeds (`POST /api/panel/v1/fleet/drivers`).
3. Fleet vehicle creation succeeds (`POST /api/panel/v1/fleet/vehicles`).
4. Driver-vehicle assignment succeeds (`POST /api/panel/v1/fleet/assignments`).
5. Access code creation succeeds (`POST /api/panel/v1/access-codes`, type `hotel` or `voucher`).
6. Voucher/hotel booking creates a ride (`POST /api/rides` or panel booking endpoints with access code).
7. Fleet driver login succeeds (`POST /api/fleet-auth/login`).
8. Open ride is visible to driver feed/list.
9. Ride can be accepted and changes to `status = accepted` with the correct `driverId`.

## Expected Failures (By Design)

- `company_profile_incomplete` when required legal/profile fields are missing.
- `required_documents_missing` when Gewerbe/Insurance docs are absent.
- `voucher_booking_not_allowed` when `fare_permissions.voucher` is false.
- `insurer_booking_not_allowed` when `insurer_permissions.book` is false.
- `route_outside_assigned_area` when `area_assignments` is configured and route labels do not match.

Do not weaken these guards in UI code. Fix the tenant configuration or permissions instead.
