import { AppShell } from '@/components/AppShell';
import { SessionsClient } from '@/components/ClientApp';

export default function ProductionPage(){
 return <AppShell active="/production"><SessionsClient context="production" /></AppShell>;
}
