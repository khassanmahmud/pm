import type { Board } from "@/lib/board";
import defaultBoard from "../../../backend/app/default_board.json";

// The board the backend seeds for new users.
export const initialBoard = defaultBoard as Board;
