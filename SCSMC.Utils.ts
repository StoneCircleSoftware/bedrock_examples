import { world, Block, Vector3, Direction} from "@minecraft/server";
import { MCBlockIDs } from "./SCSMC.IDs";

const LOG_PREFIX = "[SCSMC]";

export type VecKey = string;

/** an attempt to prevent JS from recreating vectors for comparisons and common/repeated checks etc. */
const OFFSET_UP: Readonly<Vector3> = { x: 0, y: 1, z: 0 };
const OFFSET_DOWN: Readonly<Vector3> = { x: 0, y: -1, z: 0 };
const OFFSET_NORTH: Readonly<Vector3> = { x: 0, y: 0, z: -1 };
const OFFSET_SOUTH: Readonly<Vector3> = { x: 0, y: 0, z: 1 };
const OFFSET_WEST: Readonly<Vector3> = { x: -1, y: 0, z: 0 };
const OFFSET_EAST: Readonly<Vector3> = { x: 1, y: 0, z: 0 };

/** iterable lookup matrix for blocks neighbouring another block */
const NEIGHBOUR_OFFSETS: readonly Readonly<Vector3>[] = [
    OFFSET_EAST,
    OFFSET_WEST,
    OFFSET_UP,
    OFFSET_DOWN,
    OFFSET_SOUTH,
    OFFSET_NORTH
];

/** map offset vectors to an easy to use direction */
const OFFSET_TO_DIRECTION: Record<string, Direction> = {
    [vectorKey(OFFSET_EAST)]: Direction.East,
    [vectorKey(OFFSET_WEST)]: Direction.West,
    [vectorKey(OFFSET_UP)]: Direction.Up,
    [vectorKey(OFFSET_DOWN)]: Direction.Down,
    [vectorKey(OFFSET_NORTH)]: Direction.North,
    [vectorKey(OFFSET_SOUTH)]: Direction.South,
};

/** logging levels reflect supported log types in bedrock JVM */
export enum LoggingLevel {
    Verbose,
    Info,
    Warning,
    Error
};

/** vector to string to use as keys for faster lookups */
export function vectorKey(v: Readonly<Vector3>): VecKey {
    return `${v.x},${v.y},${v.z}`;
}

/** SCS Minecraft Utility Class - if a method becomes commonly used in multiple places please move it here */
export namespace SCSMCUtils {

    /** logs a message at the desired logging level. if echo is true it also outputs to game chat. */
    export function log(logLevel: LoggingLevel, msg: string, echo: boolean = false) {
        const logMessage = `${LOG_PREFIX} ${msg}`;

        switch (logLevel) {
            case LoggingLevel.Verbose:
                console.log(logMessage);
                break;

            case LoggingLevel.Info:
                console.info(logMessage);
                break;

            case LoggingLevel.Warning:
                console.warn(logMessage);
                break;

            case LoggingLevel.Error:
                console.error(logMessage);
                break;
        }

        if (echo == true) {
            writeToChat(logMessage);
        }
    }

    /** sends a message to the game chat */
    export function writeToChat(msg: string) {
        world.sendMessage(msg);
    }

    /** given a specific block, returns true if any neighbouring block is solid (not air, not liquid) */
    export function hasSolidNeighbour(block: Block): boolean {
        const position = block.location;

        for (const o of NEIGHBOUR_OFFSETS) {
            const neighbourOffset = {
                x: position.x + o.x,
                y: position.y + o.y,
                z: position.z + o.z
            };

            const neighbour = block.dimension.getBlock(neighbourOffset);

            if (neighbour && !neighbour.isAir && !neighbour.isLiquid) {
                return true;
            }
        }

        return false;
    }

    /** provide an array of block ids to get a map of directions to boolean yes/no "im here" */
    export function hasNeighboursOfType(block: Block, validTypes: string[]): Record<Direction, boolean> {
        const position = block.location;
        const result: Record<Direction, boolean> = {
            [Direction.North]: false,
            [Direction.South]: false,
            [Direction.East]: false,
            [Direction.West]: false,
            [Direction.Up]: false,
            [Direction.Down]: false
        };

        for (const o of NEIGHBOUR_OFFSETS) {
            const neighbourOffset = {
                x: position.x + o.x,
                y: position.y + o.y,
                z: position.z + o.z
            };

            const neighbour = block.dimension.getBlock(neighbourOffset);

            if (neighbour && validTypes.includes(neighbour.typeId)) {
                const direction = OFFSET_TO_DIRECTION[vectorKey(o)];
                result[direction] = true;
            }
        }

        return result;
    }

    /** kicks the minecraft engine to update blocks in chunk by finding some empty air to rotate type on (required to get progmatically placed water flowing etc) */
    export function tryForceUpdate(block: Block): boolean {
        const position = block.location;

        for (const o of NEIGHBOUR_OFFSETS) {
            const neighbourOffset = {
                x: position.x + o.x,
                y: position.y + o.y,
                z: position.z + o.z
            };

            const neighbour = block.dimension.getBlock(neighbourOffset);

            if (neighbour && neighbour.isAir) {
                neighbour.setType(MCBlockIDs.Bedrock);
                neighbour.setType(MCBlockIDs.Air);
                return true;
            }
        }

        return false;
    }

    /** given a direction return the correct world offset to reference it */
    export function getOffsetFromFace(face: Direction): Vector3 {
        switch (face) {
            case Direction.Up: return OFFSET_UP;
            case Direction.Down: return OFFSET_DOWN;
            case Direction.North: return OFFSET_NORTH;
            case Direction.South: return OFFSET_SOUTH;
            case Direction.West: return OFFSET_WEST;
            case Direction.East: return OFFSET_EAST;
        }
    }

    export function vstr(v: Vector3) {
        return `(${v.x}, ${v.y}, ${v.z})`;
    }
}