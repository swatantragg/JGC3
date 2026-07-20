import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});

export default function QueryProvider({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
