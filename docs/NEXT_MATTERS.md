# What was built next (the things that actually matter)

1. **Official DHIMS2 / IDSR extracts** - `/extracts` parses week_ending/date + cases, logs gaps, duplicates, negatives, completeness, and stores the series for the forecast desk.
2. **District completeness** - every region has representative MMDAs (51 on the desk). Not all 261: small-cell risk.
3. **Reporting-delay nowcast** - last weeks treated as incomplete reports. Interval, not a secret true count. Needs vintage tables later.
4. **Spoken field briefs** - `/field` in English, Twi, Ewe, Ga, Hausa + TTS.
5. **Signed audit** - HMAC-SHA256 on the admin export; POST the file back to `/api/admin/audit` to verify.

Selftest covers parser quality, nowcast interval, field card, and the previous desks.
