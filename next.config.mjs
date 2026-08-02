/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/tonconnect-manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/constructor",
        destination: "/scene-constructor",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
