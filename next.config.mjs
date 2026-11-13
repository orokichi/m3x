/** @type {import('next').NextConfig} */
export default {
  // rettiwt-api is bundled (not external) so its ESM-only deps (linkedom → cssomnom/css-select) work on Vercel.
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: '/bookmarks', destination: '/keep', permanent: false },
      { source: '/memo', destination: '/keep', permanent: false },
      { source: '/super-search', destination: '/explore', permanent: false },
    ];
  },
};
