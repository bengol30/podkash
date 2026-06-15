import { AppShell } from '@/components/AppShell';
import { PeopleClient } from '@/components/ClientApp';

export default function PeoplePage(){
 return <AppShell active="/people"><PeopleClient /></AppShell>;
}
