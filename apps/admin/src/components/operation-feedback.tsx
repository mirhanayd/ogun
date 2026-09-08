export function OperationFeedback({ message, error }: { message?: string; error?: string }) {
  if (error) return <p className="error" role="alert">{error}</p>
  if (message) return <p className="notice" role="status">{message}</p>
  return null
}
