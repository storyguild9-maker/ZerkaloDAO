export type CouncilSeatStatus = "open" | "reserved" | "present";

export type CouncilSeat = {
  id: string;
  index: number;
  angle: number;
  position: [number, number, number];
  rotationY: number;
  status: CouncilSeatStatus;
  sessionId?: string;
};

const seatCount = 12;
const tableRadius = 7.45;

export const councilSeats: CouncilSeat[] = Array.from({ length: seatCount }, (_, index) => {
  const angle = -Math.PI / 2 + (index / seatCount) * Math.PI * 2;
  const x = Math.cos(angle) * tableRadius;
  const z = Math.sin(angle) * tableRadius - 2.8;

  return {
    id: `council-seat-${index + 1}`,
    index: index + 1,
    angle,
    position: [x, -0.72, z],
    rotationY: -angle + Math.PI / 2,
    status: index === 0 ? "present" : index < 4 ? "reserved" : "open"
  };
});

export const councilHallConcepts = [
  {
    id: "black-gold-vista",
    url: "/images/inner-council/council-hall-black-gold-vista.png",
    role: "black marble, gold, violet crystal, panoramic council chamber"
  },
  {
    id: "white-gold-garden",
    url: "/images/inner-council/council-hall-white-gold-garden.png",
    role: "white marble, open garden, luminous council hall"
  },
  {
    id: "golden-table-close",
    url: "/images/inner-council/council-hall-golden-table-close.png",
    role: "close view of ornate table, chairs, candles and ceremonial detail"
  }
] as const;
