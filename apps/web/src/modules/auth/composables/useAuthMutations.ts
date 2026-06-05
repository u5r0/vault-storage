import { useMutation, useQueryClient } from "@tanstack/vue-query"
import { useRouter } from "vue-router"
import { useAuthStore, AuthError } from "@/stores/auth"

export function useSignIn() {
  const auth = useAuthStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      auth.signIn(email, password),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["files"] })
      router.push("/contents")
    },
  })
}

export function useSignOut() {
  const auth = useAuthStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: () => auth.signOut(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["files"] })
      router.push("/login")
    },
  })
}

export function useSignUp() {
  const auth = useAuthStore()

  return useMutation({
    mutationFn: ({
      email,
      password,
      name,
    }: {
      email: string
      password: string
      name?: string
    }) => auth.signUp(email, password, name),
  })
}

export function useRequestMagicLink() {
  const auth = useAuthStore()

  return useMutation({
    mutationFn: (email: string) => auth.requestMagicLink(email),
  })
}

export function useResendVerification() {
  const auth = useAuthStore()

  return useMutation({
    mutationFn: (email: string) => auth.resendVerification(email),
  })
}

export function useVerifyToken() {
  const auth = useAuthStore()

  return useMutation({
    mutationFn: (token: string) => auth.verifyToken(token),
  })
}

export function useForgotPassword() {
  const auth = useAuthStore()

  return useMutation({
    mutationFn: (email: string) => auth.forgotPassword(email),
  })
}

export function useResetPassword() {
  const auth = useAuthStore()
  const router = useRouter()

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      auth.resetPassword(token, password),
    onSuccess: () => {
      router.push("/login")
    },
  })
}

export { AuthError }
