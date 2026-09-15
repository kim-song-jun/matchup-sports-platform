-- Which APNs gateway a device's token belongs to.
--
-- Separate from v1_push_devices.environment, which says which deployment the device is on.
-- The two coincided until TestFlight: an alpha build was only ever installed from Xcode and
-- that is always development-signed, so alpha implied the sandbox gateway. A TestFlight build
-- of the same app is production-signed, so an alpha device can hold a production token, and
-- sending that to the sandbox gateway returns BadDeviceToken — which the send path treats as
-- permanent and revokes the registration outright.
--
-- Nullable on purpose, and not backfilled. Android has no such axis. An iOS registration made
-- before the app reported this keeps falling back to the server's own environment, which is
-- exactly the behaviour it already had; a value guessed here would be indistinguishable from
-- one a device actually reported.
CREATE TYPE "V1ApnsEnvironment" AS ENUM ('sandbox', 'production');

ALTER TABLE "v1_push_devices" ADD COLUMN "apns_environment" "V1ApnsEnvironment";
