import { AppShell } from '@/components/AppShell';
import { MessagesClient } from '@/components/ClientApp';

export default function MessagesPage(){
 return <AppShell active="/messages"><MessagesClient /></AppShell>;
}
