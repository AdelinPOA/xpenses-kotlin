# Add FX margins management to admin settings

## Why

FX conversion uses per-currency margins over the BNR reference rate, stored as a JSON blob in the `fx_margins` app setting. Today the only way to change them is direct SQL against `app_settings` — finance admins have no UI, which blocks adjusting the policy as bank spreads change (e.g. UniCredit vs BCR).

## Problem Statement

FX conversion uses per-currency margins over the BNR reference rate, stored as a JSON blob in the `fx_margins` app setting. Today the only way to change them is direct SQL against `app_settings` — finance admins have no UI, which blocks adjusting the policy as bank spreads change (e.g. UniCredit vs BCR).

## Goals

- Finance admins can view and edit the FX margin for each currency from the admin settings page.
- Defaults match the seeded policy (EUR +2%, USD +2.5%, GBP +2%, CHF +2%, +2% fallback for other currencies).
- The stored format stays backward-compatible with `FxService.getMargin` (JSON map currency → fraction).
- Guards: only `chef_finance` role can mutate; read is available to authenticated admins.

## Non-Goals

- Per-user bank configuration (decided against in the FX design session).
- Changing the FX rate source or margin semantics.
- Editing margins from the technician/manager UI.
- Validation of margin values against real bank data (free-form percentages, as decided).
