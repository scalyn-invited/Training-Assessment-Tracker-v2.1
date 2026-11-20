import Link from 'next/link';
import { RecoveryFrame } from './components/recovery-frame';
import controls from './components/ui/controls.module.css';
export default function NotFound() {
  return (
    <RecoveryFrame
      title="Page unavailable"
      message="This address is not available in the current build."
    >
      <Link className={`${controls.button} ${controls.primary}`} href="/">
        Return to the application
      </Link>
    </RecoveryFrame>
  );
}
