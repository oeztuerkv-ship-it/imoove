import { useNavigationContainerRef } from "expo-router";
import { useEffect } from "react";

import { bindRootNavigationRef } from "@/utils/rootNavigationRef";

/** Hält Ref zur Root-NavigationContainer für CommonActions.reset (Stack-Clear). */
export function RootNavigationRefBinder() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    bindRootNavigationRef(ref);
    return () => bindRootNavigationRef(null);
  }, [ref]);

  return null;
}
