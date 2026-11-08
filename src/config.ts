/** Same Auth0 tenant / API audience as Tools + ytube-download desktop. */
export const AUTH0_DOMAIN =
  (import.meta.env.VITE_AUTH0_DOMAIN as string | undefined)?.trim() ||
  'dev-tvq4tbikhbet8orb.us.auth0.com'
export const AUTH0_CLIENT_ID =
  (import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined)?.trim() ||
  'YX6isR6f4VdTViqA7tcVxlKUeWyk4ITY'
export const AUTH0_AUDIENCE =
  (import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined)?.trim() ||
  'https://api.ai-forall.org'
/** Tools API — profile source of truth */
export const TOOLS_API_BASE =
  (import.meta.env.VITE_TOOLS_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ||
  'https://api.tools.ai-forall.org'
export const TOOLS_PLANS_URL = 'https://tools.ai-forall.org/plans'
export const TOOLS_PROFILE_URL = 'https://tools.ai-forall.org/profile'
export const TOOLS_KNOWN_ISSUES_URL = 'https://tools.ai-forall.org/help/known-issues'
export const PRIVACY_URL = 'https://ai-forall.org/privacy.html'
export const COMPANY_FOOTER = '© 2026 AI-forAll Hong Kong Limited 全民人工智能香港有限公司'
