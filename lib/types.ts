export interface XUser {
  id: string; name: string; handle: string; avatar: string; banner?: string;
  bio?: string; location?: string; url?: string; followers: number; following: number;
  tweets: number; likes?: number; verified: boolean; isFollowing?: boolean; followsYou?: boolean; createdAt?: string;
}
export interface XMedia { type: 'photo' | 'video' | 'gif'; url: string; thumb?: string; w?: number; h?: number; video?: string; /** dominant colour, when X provides one */ c?: string }
export interface XCard { url: string; title?: string; desc?: string; image?: string; domain?: string }
export interface XTweet {
  id: string; text: string; createdAt: string; user: XUser;
  likes: number; retweets: number; replies: number; quotes: number; views?: number; bookmarks: number;
  liked: boolean; retweeted: boolean; bookmarked: boolean;
  media: XMedia[]; quoted?: XTweet; rtBy?: XUser; replyTo?: string; replyToId?: string;
  urls: { url: string; expanded: string; display: string }[]; card?: XCard;
}
export interface XNotif { id: string; message: string; type?: string; at: string; users: XUser[]; tweet?: XTweet }
export interface XTrend { name: string; query: string; volume?: number }
export interface Page<T> { list: T[]; next?: string }
