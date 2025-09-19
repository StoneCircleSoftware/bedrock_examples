import { BlockEvent, system, Vector3, world, Block } from '@minecraft/server';
import { SCSMCUtils, VecKey, vectorKey } from '@scsmccore/SCSMC.Utils';
import { LoggingLevel } from '../../../SCSMC.Core/ts/SCSMC.Utils';
import { SCSMC_ST_BlockIds, SCSMC_UC_BlockIds } from '@scsmccore/SCSMC.IDs';
import { MinecraftDimensionTypes } from "@minecraft/vanilla-data";

const CONSOLE_RADIUS = 24;

export interface SpleefObject {
    location: Vector3,
    tag: string,
    id: string
}

export interface SpleefArenaSettings {
    autoRepair: boolean,
    repairDelay: number
}

export interface TrackedBlock {
    blockId: string,
    location: Vector3,
    brokenAt: number,
    rebuildDelay: number,
    remove: boolean
}

export interface ArenaBounds {
    left: number,
    right: number,
    front: number,
    back: number,
    top: number,
    bottom: number
}

export namespace SpleefArenaManager {
    const WP_ARENA_NAMES = "SCSMC_WP:ARENA_NAMES";
    const WP_ARENA_MARKERS = "SCSMC_WP:ARENA_MARKERS";

    const arenaTags: string[] = [];
    const markerRegistry =  new Map<string, SpleefObject[]>();
    const arenaBounds = new Map<string, ArenaBounds>();
    let trackedBlocks: TrackedBlock[] = [];

    export function registerArenaMarker(tag: string, location: Vector3, id: string, updateBounds: boolean = true) {
        SCSMCUtils.log(LoggingLevel.Verbose, "Registering or updating spleef arena marker location " + SCSMCUtils.vstr(location));

        if (arenaTags.includes(tag) == false) {
            arenaTags.push(tag);
            markerRegistry.set(tag, []);
        }

        const registry = markerRegistry.get(tag);
        const existingMarker = registry?.find(x => x.id == id);

        if (existingMarker == undefined) {
            registry?.push( {
                location: location,
                id: id,
                tag: tag
            });
        } else {
            existingMarker.location = location;
        }

        if (updateBounds) {
            updateBoundsForArena(tag);
        }
    }

    export function removeArenaMarker(tag:string, id: string) {
        if (arenaTags.includes(tag) == false) {
            SCSMCUtils.log(LoggingLevel.Verbose, "no arena exists that matches specified tag in removeArenaMarker");
            return;
        }

        const registry = markerRegistry.get(tag);
        const index = registry?.findIndex(obj => obj.id === id);

        if (index !== -1 && index !== undefined) {
            registry?.splice(index, 1);
        }

        updateBoundsForArena(tag);
    }

    function newBounds(): ArenaBounds {
        return {
            left: Infinity,
            right: -Infinity,
            front: Infinity,
            back: -Infinity,
            top: -Infinity,
            bottom: Infinity
        }
    }

    function defaultArenaSettings(): SpleefArenaSettings {
        return {
            autoRepair: true,
            repairDelay: 10000 //30000ms = 30secs
        }
    }

    export function updateBoundsForArena(arenaTag: string) {
        if (arenaTags.includes(arenaTag) == false) {
            SCSMCUtils.log(LoggingLevel.Warning, "requested to update bounds for an arena we do not know about");
            return;
        }

        const registry = markerRegistry.get(arenaTag);
        const bounds: ArenaBounds = newBounds();

        registry?.forEach(x => {
            const loc = x.location;

            if (loc.x < bounds.left) bounds.left = loc.x;
            if (loc.x > bounds.right) bounds.right = loc.x;
            if (loc.y < bounds.bottom) bounds.bottom = loc.y;
            if (loc.y > bounds.top) bounds.top = loc.y;
            if (loc.z < bounds.front) bounds.front = loc.z;
            if (loc.z > bounds.back) bounds.back = loc.z
        });

        arenaBounds.set(arenaTag, bounds);
    }

    export function findArenasForLocation(location: Vector3) {
        const arenaBlocks: Vector3[] = [];
        const dim = world.getDimension("overworld");

        const radius = CONSOLE_RADIUS;
        const y_radius = 6;
        const batchSize = 200;

        let x = -radius;
        let y = -y_radius;
        let z = -radius;
        let blocks_scanned = 0;

        SCSMCUtils.log(LoggingLevel.Verbose, "attempting to find attached arenas for console " + SCSMCUtils.vstr(location));
        SCSMCUtils.log(LoggingLevel.Verbose, "This operation could take quite a long time. Radius set to " + CONSOLE_RADIUS + " and Y-Radius is fixed at " + y_radius);

        function scanBatch() {
            let count = 0;
            SCSMCUtils.log(LoggingLevel.Verbose, "blocks scanned: " + blocks_scanned);

            while (count < batchSize && x <= radius) {
                const pos = {
                    x: location.x + x,
                    y: location.y + y,
                    z: location.z + z
                };

                const block = dim.getBlock(pos);
                if (block?.typeId === SCSMC_ST_BlockIds.ArenaMarker) {
                    arenaBlocks.push(pos);
                }
                blocks_scanned++;
                // Move forward in scan order
                z++;
                if (z > radius) {
                    z = -radius;
                    y++;
                    if (y > y_radius) {
                        y = -y_radius;
                        x++;
                    }
                }

                count++;
            }

            if (x <= radius) {
                system.run(scanBatch);
            } else {
                SCSMCUtils.log(LoggingLevel.Verbose, `Scan complete. Found ${arenaBlocks.length} arena markers near location at ${location.x},${location.y},${location.z}`);
                onFound(arenaBlocks);
            }
        }

        scanBatch();
    }

    export function trackBlockBreak(block: Block) {
        const location = block.location;
        SCSMCUtils.log(LoggingLevel.Verbose, "checking to see if block shoudl be tracked..");

        arenaBounds.forEach((x) => {
            if (inBounds(x, location)) {
                const arenaSettings = defaultArenaSettings();   //this will eventually be able to be different depending on which arena/tag the block belongs to

                trackedBlocks.push({
                    blockId: block.typeId,
                    location: location,
                    brokenAt: Date.now(),
                    rebuildDelay: arenaSettings.repairDelay,
                    remove: false
                });

                SCSMCUtils.log(LoggingLevel.Verbose, "tracking block!");
            }
        })
    }

    export function inBounds(bounds: ArenaBounds, loc: Vector3): boolean {
        return (
            loc.x >= bounds.left &&
            loc.x <= bounds.right &&
            loc.y >= bounds.bottom &&
            loc.y <= bounds.top &&
            loc.z >= bounds.front &&
            loc.z <= bounds.back
        );
    }

    export function update() {
        if (trackedBlocks.length > 0) {
            system.run(() => {
                const timeNow = Date.now();
                const overworld = world.getDimension(MinecraftDimensionTypes.Overworld);

                trackedBlocks.forEach((x) => {
                    if (timeNow - x.brokenAt > x.rebuildDelay) {
                        SCSMCUtils.log(LoggingLevel.Verbose, "rebuilding block at " + x.location.x + ", " + x.location.y + ", " + x.location.z + " with type" + x.blockId);
                        const block = overworld.getBlock(x.location);

                        if (!block) {
                            SCSMCUtils.log(LoggingLevel.Error, "could not resolve block space to rebuild!");
                            return;
                        }

                        SCSMCUtils.log(LoggingLevel.Verbose, "setting block type");
                        block.setType(x.blockId);
                        x.remove = true;
                    }
                })

                trackedBlocks = trackedBlocks.filter(x => x.remove == false);
            });
        }
    }

    export function saveAllToWorld() {
        let arenaString = arenaTags.join('#');
        world.setDynamicProperty(WP_ARENA_NAMES, arenaString);

        arenaTags.forEach(x => {
            let markersString = markerRegistry.get(x)?.map(x => `${x.location.x},${x.location.y},${x.location.z},`).join('#');
            world.setDynamicProperty(WP_ARENA_MARKERS + "_" + x, markersString);
        });
    }

    export function loadAllFromWorld() {
        let arenaString = world.getDynamicProperty(WP_ARENA_NAMES) as string;
        let arenas = arenaString.split('#');
        arenaTags.splice(0, arenaTags.length);
        arenaTags.push(...arenas);

        arenaTags.forEach(x => {
            let markersString = world.getDynamicProperty(WP_ARENA_MARKERS + "_" + x) as string;
            let markers = markersString.split('#');

            markers.forEach(x => {
                let components = x.split(',').map(v => Number(v));
                let vec: Vector3 = {
                    x: components[0],
                    y: components[1],
                    z: components[2]
                };

                registerArenaMarker(x, vec, vectorKey(vec), false);
            });

            updateBoundsForArena(x);
        });
    }

    function onFound(blocks: Vector3[]) {

    }
}

