import type { InjectionKey } from 'vue'
// @ts-ignore - Vuex types issue with package.json exports
import { createStore, Store } from 'vuex'
import auth from './modules/auth'

export interface RootState {
  auth: {
    isAuthenticated: boolean
    user: { id: string; email: string; createdAt: string } | null
    loading: boolean
    error: string | null
  }
}

export const key: InjectionKey<Store<RootState>> = Symbol()

export const store = createStore<RootState>({
  modules: {
    auth,
  },
})

export default store
