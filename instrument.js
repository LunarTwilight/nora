const Sentry = require('@sentry/node');
Sentry.init({
    dsn: process.env.DSN,
    tracesSampleRate: 1.0
});