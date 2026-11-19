import type { V1RequestIdentity } from './v1-session';

// Only the global member-access guard can populate this server-side map after authorization.
// A request header, JSON property, or Socket.IO auth object cannot manufacture an override.
const identities = new WeakMap<object, V1RequestIdentity>();
export function setMemberAccessIdentity(request: object, identity: V1RequestIdentity) { identities.set(request, identity); }
export function getMemberAccessIdentity(request: object) { return identities.get(request); }
