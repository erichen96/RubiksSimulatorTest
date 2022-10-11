import { Alg, AlgBuilder, Move, QuantumMove } from "../../../alg";
import type { KPuzzle, KTransformation } from "../../../kpuzzle";
import type { KState } from "../../../kpuzzle/KState";
import { experimentalCountMoves } from "../../../notation";
import { randomChoiceFactory } from "../../../vendor/random-uint-below";
import type { SGSAction, SGSCachedData } from "./parseSGS";

const DEFAULT_STAGE1_DEPTH_LIMIT = 2; // Moderately performant default.

const DOUBLECHECK_PLACED_PIECES = true;
const DEBUG = false;

// TODO: Take moves instead of move names?
function calculateMoves(
  kpuzzle: KPuzzle,
  moveNames: string[],
): {
  move: Move;
  transformation: KTransformation;
}[] {
  const searchMoves: {
    move: Move;
    transformation: KTransformation;
  }[] = [];
  // const identity = identityTransformation(def); // TODO
  // TODO: Make it easy to filter moves.
  moveNames.forEach(function (moveName) {
    const rootMove = new Move(moveName);
    if (rootMove.amount !== 1) {
      throw new Error(
        "SGS cannot handle def moves with an amount other than 1 yet.",
      );
    }
    let transformation = kpuzzle.identityTransformation();
    for (let i = 1; true; i++) {
      transformation = transformation.applyMove(rootMove);
      if (transformation.isIdentityTransformation()) {
        break;
      }
      searchMoves.push({
        move: rootMove.modified({ amount: i }),
        transformation,
      });
    }
  });
  return searchMoves;
}

// function badRandomMoves(moves: string[], ksp: KSolvePuzzle): KSolvePuzzleState {
//   // var sum = 0;
//   var scramble = "";
//   for (var i = 0; i < 1000; i++) {
//     scramble = scramble + " " + moves[Math.floor(moves.length * Math.random())];
//   }
//   // var sol = "";
//   const indexer = new TreeAlgIndexer(ksp, Alg.fromString(scramble));
//   return indexer.transformAtIndex(indexer.numMoves()) as any; // TODO
// }

export class TrembleSolver {
  private searchMoves: {
    move: Move;
    transformation: KTransformation;
  }[];

  constructor(
    private kpuzzle: KPuzzle,
    private sgs: SGSCachedData,
    trembleMoveNames?: string[],
  ) {
    this.searchMoves = calculateMoves(
      this.kpuzzle,
      trembleMoveNames ?? Object.keys(this.kpuzzle.definition.moves),
    );
  }

  // public badRandomMoves(): KSolvePuzzleState {
  //   return badRandomMoves(this.moves, this.ksp);
  // }

  public async solve(
    state: KState,
    stage1DepthLimit: number = DEFAULT_STAGE1_DEPTH_LIMIT,
    quantumMoveOrder?: (quantumMove: QuantumMove) => number,
  ): Promise<Alg> {
    const transformation = state.experimentalToTransformation();
    if (!transformation) {
      throw new Error(
        "distinguishable pieces are not supported in tremble solver yt",
      );
    }
    let bestAlg: Alg | null = null;
    let bestLen = 1000000;
    const recur = (
      recursiveTransformation: KTransformation, // TODO: Support KStatq1
      togo: number,
      sofar: Alg,
    ) => {
      // console.log("recur");
      if (togo === 0) {
        const sgsAlg = this.sgsPhaseSolve(recursiveTransformation, bestLen);
        if (!sgsAlg) {
          return;
        }
        // console.log("sgs done!", sofar.toString(), "|", sgsAlg.toString());
        const newAlg = sofar.concat(sgsAlg).experimentalSimplify({
          cancel: { puzzleSpecificModWrap: "canonical-centered" },
          puzzleSpecificSimplifyOptions: { quantumMoveOrder },
        });

        const len = experimentalCountMoves(newAlg);
        if (bestAlg === null || len < bestLen) {
          if (DEBUG) {
            console.log(`New best (${len} moves): ${newAlg.toString()}`);
            console.log(`Tremble moves are: ${sofar.toString()}`);
          }
          bestAlg = newAlg;
          bestLen = len;
        }
        return;
      }
      for (const searchMove of this.searchMoves) {
        recur(
          recursiveTransformation.applyTransformation(
            searchMove.transformation,
          ),
          togo - 1,
          sofar.concat([searchMove.move]),
        );
      }
    };
    for (let d = 0; d <= stage1DepthLimit; d++) {
      recur(transformation, d, new Alg());
    }
    if (bestAlg === null) {
      throw new Error("SGS search failed.");
    }
    return bestAlg;
  }

  private sgsPhaseSolve(
    initialTransformation: KTransformation, // TODO: Handle KState
    bestLenSofar: number,
  ): Alg | null {
    // const pieceNames = "UFR URB UBL ULF DRF DFL DLB DBR".split(" ");

    // function loggo(s: string) {
    //   // console.warn(s);
    //   // document.body.appendChild(document.createElement("div")).textContent = s;
    // }

    // console.log("sgsPhaseSolve");
    const algBuilder = new AlgBuilder();
    let transformation = initialTransformation;
    for (const step of this.sgs.ordering) {
      const cubieSeq = step.pieceOrdering;
      let key = "";
      const inverseTransformation = transformation.invert();
      for (let i = 0; i < cubieSeq.length; i++) {
        const loc = cubieSeq[i];
        const orbitName = loc.orbitName;
        const idx = loc.permutationIdx;
        key += ` ${inverseTransformation.transformationData[orbitName].permutation[idx]} ${inverseTransformation.transformationData[orbitName].orientation[idx]}`;
      }
      // console.log(key, step.lookup);
      const info = step.lookup[key];
      if (!info) {
        throw new Error("Missing algorithm in sgs or esgs?");
      }
      algBuilder.experimentalPushAlg(info.alg);
      if (algBuilder.experimentalNumAlgNodes() >= bestLenSofar) {
        return null;
      }
      transformation = transformation.applyTransformation(info.transformation);
      if (DOUBLECHECK_PLACED_PIECES) {
        for (let i = 0; i < cubieSeq.length; i++) {
          const location = cubieSeq[i];
          const orbitName = location.orbitName;
          const idx = location.permutationIdx;
          if (
            transformation.transformationData[orbitName].permutation[idx] !==
              idx ||
            transformation.transformationData[orbitName].orientation[idx] !== 0
          ) {
            throw new Error("bad SGS :-(");
          }
        }
      }
    }
    return algBuilder.toAlg();
  }
}

export async function randomStateFromSGS(
  kpuzzle: KPuzzle,
  sgs: SGSCachedData,
): Promise<KState> {
  const randomChoice = await randomChoiceFactory<SGSAction>(); // TODO: make this sync by putting the factory into a TLA

  let transformation = kpuzzle.identityTransformation();
  for (const step of sgs.ordering) {
    const sgsAction = randomChoice(Object.values(step.lookup));
    transformation = transformation.applyTransformation(
      sgsAction.transformation,
    );
  }
  return transformation.toKState();
}
