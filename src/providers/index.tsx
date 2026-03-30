import type { PropsWithChildren } from "react";
import { ReactQueryProvider } from "./react-query-provider";

export function AppProvider({ children }: PropsWithChildren) {
  return <ReactQueryProvider>{children}</ReactQueryProvider>;
}
