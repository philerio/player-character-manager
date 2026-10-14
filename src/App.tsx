import { useAppController } from "./app/useAppController";
import { AppShell } from "./components/AppShell";

export default function App() {
  const controller = useAppController();
  return <AppShell controller={controller} />;
}
