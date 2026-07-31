/** @type {import('next').NextConfig} */
const nextConfig = {
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
