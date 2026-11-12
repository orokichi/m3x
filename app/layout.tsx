import './globals.css';
import type { Metadata, Viewport } from 'next';
import Shell from '@/components/Shell';
import { THEME_BOOT } from '@/lib/themeBoot';

export const metadata: Metadata = {
  title: 'M3X',
  description: 'Material 3 Expressive で作った X クライアント',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f9ff' };

/* Material Symbols: only the icons the app uses (icon_names) + only the axes it uses → ~60 KB instead of ~5 MB.
   Regenerate with: node scripts/icons.mjs (after adding a new icon name). */
const ICONS = 'add,add_link,anchor,api,arrow_back,arrow_upward,article,assistant,auto_awesome,badge,bar_chart,block,bookmark,bookmarks,box,brightness_auto,browse,build,cached,calendar_month,cancel,chat,chat_bubble,check,check_circle,chevron_left,chevron_right,chips,class,clear,clear_all,close,cloud_off,code,colorize,cookie,create,create_new_folder,css,cut,dataset,delete,description,details,devices,dock,domain,done,draw,drive_file_move,edit,edit_square,error,event,explore,favorite,feed,files,filter,floor,folder,folder_open,function,gif,group,group_add,height,help,history,home,hourglass_top,html,http,https,image,inbox,info,input,ios_share,iso,join,keep,key,label,lan,light,link,list,list_alt,lists,location_on,lock,login,logout,loop,map,margin,markdown,menu,message,mobile,mode,more,mouse,move,move_to_inbox,navigation,note,note_add,notes,notifications,open_in_new,padding,palette,password,pending,people,person,photo,pill,place,play_arrow,pool,post,public,radio,refresh,remove,remove_circle,repeat,reply,router,save,score,script,search,search_off,select,send,settings,shadow,share,shift,sleep,smart_toy,sort,start,step,steps,sticky_note_2,stop,storage,store,style,summarize,swipe,switch,sync,tab,tabs,tag,target,task_alt,timeline,title,toast,today,token,transform,try,undo,upload,verified,visibility,warning,width,window';
const SYMBOLS = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400..500,0..1,0&icon_names=${ICONS}&display=block`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <meta name="referrer" content="no-referrer" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,400..800&family=Noto+Sans+JP:wght@400..800&family=Instrument+Serif:ital@0;1&display=swap" />
        <link rel="stylesheet" href={SYMBOLS} />
        <link rel="preconnect" href="https://pbs.twimg.com" />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
