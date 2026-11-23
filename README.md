# Food Date Tracker

Tracks use-by dates for food and emails everyone in a group ~2 months before (and 1 week before) things go out of date.
Live at https://food.jamietaylor.org — Cloudflare Worker + KV storage, daily 8am check, emails sent with Resend from alerts.jamietaylor.org.

- Everyone signs up with their own email and password.
- Each group has its own food list. Add people by email; if they haven't signed up yet they get an invite and join when they do.
- Every push to `main` deploys automatically.
