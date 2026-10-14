import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { useAppController } from "./app/useAppController";
import { AppShell } from "./components/AppShell";

function Application() {
  const controller = useAppController();
  return <AppShell controller={controller} />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Application />
    </AppErrorBoundary>
  );
}
