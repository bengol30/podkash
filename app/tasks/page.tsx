import { AppShell } from '@/components/AppShell';
import { TasksClient } from '@/components/ClientApp';

export default function TasksPage(){
 return <AppShell active="/tasks"><TasksClient /></AppShell>;
}
