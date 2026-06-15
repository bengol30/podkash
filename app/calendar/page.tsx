import { AppShell } from '@/components/AppShell';
import { SessionsClient } from '@/components/ClientApp';

export default function CalendarPage(){
 return <AppShell active="/calendar"><SessionsClient context="calendar" /></AppShell>;
}
