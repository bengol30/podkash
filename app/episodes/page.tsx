import { AppShell } from '@/components/AppShell';
import { EpisodesClient } from '@/components/ClientApp';

export default function EpisodesPage(){
 return <AppShell active="/episodes"><EpisodesClient /></AppShell>;
}
