import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contract } from "../target/types/contract";
import { assert } from "chai";

describe("contract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Contract as Program<Contract>;

  // Keypairs for the two players and the game account
  const playerOne = provider.wallet; // Default wallet
  const playerTwo = anchor.web3.Keypair.generate();
  const game = anchor.web3.Keypair.generate();

  // Fund Player Two with some SOL
  before(async () => {
    const airdropTx = await provider.connection.requestAirdrop(
      playerTwo.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });
  });

  it("Initializes a game in 'Pending' state", async () => {
    const stakeAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

    await program.methods
      .initializeGame(playerTwo.publicKey, stakeAmount)
      .accounts({
        game: game.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([game])
      .rpc();

    const gameData = await program.account.game.fetch(game.publicKey);

    assert.ok(gameData.state.hasOwnProperty("pending"), "Game state should be Pending");
    assert.ok(gameData.turn === 1, "Turn should be 1 for White");
    assert.ok(gameData.players[0].equals(playerOne.publicKey), "Player One is not set correctly");
    assert.ok(gameData.players[1].equals(playerTwo.publicKey), "Player Two is not set correctly");
  });

  it("Allows Player Two to join the game", async () => {
    await program.methods
      .joinGame()
      .accounts({
        game: game.publicKey,
        playerTwo: playerTwo.publicKey,
      })
      .signers([playerTwo])
      .rpc();

    const gameData = await program.account.game.fetch(game.publicKey);

    assert.ok(gameData.state.hasOwnProperty("active"), "Game state should be Active after Player Two joins");
  });

  it("Reports game result correctly", async () => {
    // Player One declares themselves as the winner
    await program.methods
      .reportGameResult(playerOne.publicKey)
      .accounts({
        game: game.publicKey,
        player: playerOne.publicKey,
      })
      .rpc();

    const gameData = await program.account.game.fetch(game.publicKey);

    assert.ok(gameData.state.hasOwnProperty("finished"), "Game state should be Finished");
    assert.ok(gameData.state.finished.winner.equals(playerOne.publicKey), "Winner should be Player One");
  });

  it("Prevents non-player from reporting the game result", async () => {
    // Create a new game for this test
    const newGame = anchor.web3.Keypair.generate();
    const stakeAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

    await program.methods
      .initializeGame(playerTwo.publicKey, stakeAmount)
      .accounts({
        game: newGame.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newGame])
      .rpc();

    await program.methods
      .joinGame()
      .accounts({
        game: newGame.publicKey,
        playerTwo: playerTwo.publicKey,
      })
      .signers([playerTwo])
      .rpc();

    const randomUser = anchor.web3.Keypair.generate();

    // Fund random user
    const airdropTx = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });

    // Attempt to report result as a non-player
    try {
      await program.methods
        .reportGameResult(playerOne.publicKey)
        .accounts({
          game: newGame.publicKey,
          player: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("The transaction should have failed for a non-player");
    } catch (error: any) {
      const errCode = error.error?.errorCode?.number ?? null;
      assert.ok(
        errCode === 6002,
        `Expected NotAPlayer error code 6002, got ${JSON.stringify(error)}`
      );
    }
  });

});
