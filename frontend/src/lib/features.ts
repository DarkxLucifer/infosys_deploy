/**
 * InfraScan Feature Flags (Part 0.2 Rule 2 & Part 3.3)
 * Controls visibility of routes and controls. Unbuilt or unconfigured features
 * are strictly not rendered.
 */

export interface FeatureFlags {
  // Routes in scope for Prompt Pack v2
  dashboard: boolean;
  reviewQueue: boolean;
  assetsList: boolean;
  inspectionsList: boolean;
  notifications: boolean;
  profile: boolean;

  // Unbuilt routes out of scope (flagged false by default to prevent dead links/buttons)
  damageMap: boolean;
  maintenanceRoute: boolean;
  reportsRoute: boolean;
  adminUsersRoute: boolean;
  adminModelsRoute: boolean;
  adminAuditRoute: boolean;
  adminHealthRoute: boolean;
  assetCreateEdit: boolean;
  inspectionCreate: boolean;
  engineerReviewScreen: boolean; // Review action clickable in queue

  // Config-gated
  supportEmailSet: boolean;
  googleOAuth: boolean;
  microsoftOAuth: boolean;
}

export const FEATURES: FeatureFlags = {
  dashboard: true,
  reviewQueue: true,
  assetsList: true,
  inspectionsList: true,
  notifications: true,
  profile: true,

  damageMap: true,
  maintenanceRoute: false,
  reportsRoute: false,
  adminUsersRoute: false,
  adminModelsRoute: false,
  adminAuditRoute: false,
  adminHealthRoute: false,
  assetCreateEdit: false,
  inspectionCreate: false,
  engineerReviewScreen: false,

  supportEmailSet: true, // support@infrascan.ai
  googleOAuth: false,    // Config-gated: only rendered if configured
  microsoftOAuth: false,
};

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return !!FEATURES[feature];
}
