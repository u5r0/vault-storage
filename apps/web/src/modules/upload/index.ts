// Upload module — no routes. State lives in `stores/upload.ts` so it can be
// shared between AppHeader and the active route. Only the queue component
// surfaces from this module; everything else is driven by the store.
export { default as UploadQueue } from "./components/UploadQueue.vue"
