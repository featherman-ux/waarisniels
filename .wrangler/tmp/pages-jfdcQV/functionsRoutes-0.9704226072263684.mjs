import { onRequestPost as __api_analytics_ts_onRequestPost } from "/Users/niels.veerman/your-travel-blog/functions/api/analytics.ts"
import { onRequestGet as __api_comments_ts_onRequestGet } from "/Users/niels.veerman/your-travel-blog/functions/api/comments.ts"
import { onRequestOptions as __api_comments_ts_onRequestOptions } from "/Users/niels.veerman/your-travel-blog/functions/api/comments.ts"
import { onRequestPost as __api_comments_ts_onRequestPost } from "/Users/niels.veerman/your-travel-blog/functions/api/comments.ts"
import { onRequestGet as __api_kv_selftest_ts_onRequestGet } from "/Users/niels.veerman/your-travel-blog/functions/api/kv-selftest.ts"
import { onRequestGet as __api_like_ts_onRequestGet } from "/Users/niels.veerman/your-travel-blog/functions/api/like.ts"
import { onRequestPost as __api_like_ts_onRequestPost } from "/Users/niels.veerman/your-travel-blog/functions/api/like.ts"
import { onRequestGet as __api_view_ts_onRequestGet } from "/Users/niels.veerman/your-travel-blog/functions/api/view.ts"

export const routes = [
    {
      routePath: "/api/analytics",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_analytics_ts_onRequestPost],
    },
  {
      routePath: "/api/comments",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_comments_ts_onRequestGet],
    },
  {
      routePath: "/api/comments",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_comments_ts_onRequestOptions],
    },
  {
      routePath: "/api/comments",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_comments_ts_onRequestPost],
    },
  {
      routePath: "/api/kv-selftest",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_kv_selftest_ts_onRequestGet],
    },
  {
      routePath: "/api/like",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_like_ts_onRequestGet],
    },
  {
      routePath: "/api/like",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_like_ts_onRequestPost],
    },
  {
      routePath: "/api/view",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_view_ts_onRequestGet],
    },
  ]