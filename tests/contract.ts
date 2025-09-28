// tests/contract.ts

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contract } from "../target/types/contract";
import { assert } from "chai";

describe("contract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Contract as Program<Contract>;

  // Create Keypairs for the two players and the game account
  const playerOne = provider.wallet; // Use the default wallet as Player One (White)
  const playerTwo = anchor.web3.Keypair.generate(); // Generate a new wallet for Player Two (Black)
  const game = anchor.web3.Keypair.generate(); // Generate a new keypair for the game account

  // Fund Player Two with some SOL so they can pay for future transactions
  before(async () => {
    const airdropTx = await provider.connection.requestAirdrop(
      playerTwo.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });
  });

  it("Initializes a game in a 'Pending' state", async () => {
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

    // Assert that the game is waiting for the second player
    assert.ok(gameData.state.hasOwnProperty('pending'), "Game state should be Pending");
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
      .signers([playerTwo]) // Player Two must sign to join
      .rpc();

    const gameData = await program.account.game.fetch(game.publicKey);

    // Assert that the game is now active
    assert.ok(gameData.state.hasOwnProperty('active'), "Game state should be Active after P2 joins");
  });

  it("Allows Player One to make the first move", async () => {
    // Player One (White) makes the move "e2e4"
    await program.methods
      .makeMove("e2e4")
      .accounts({
        game: game.publicKey,
        player: playerOne.publicKey,
      })
      // No extra signers needed, playerOne is the provider's default wallet
      .rpc();

    const gameData = await program.account.game.fetch(game.publicKey);

    // Assert that the state updated correctly
    assert.ok(gameData.turn === 2, "Turn should now be 2 for Black");
    // This is the FEN string for the board after the move e2e4
    assert.ok(gameData.board.startsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b"), "Board state did not update correctly");
  });

  it("Prevents the wrong player from making a move", async () => {
    // It is now Player Two's turn. We will try to make a move with Player One.
    try {
      await program.methods
        .makeMove("d2d4") // Some random move
        .accounts({
          game: game.publicKey,
          player: playerOne.publicKey,
        })
        .rpc();
      
      assert.fail("The transaction should have failed but did not.");
    } catch (error) {
      assert.include(error.toString(), "NotPlayerTurn");
    }
  });

  it("Allows Player Two to make a responding move", async () => {
    // Player Two (Black) responds with "e7e5"
    await program.methods
      .makeMove("e7e5")
      .accounts({
        game: game.publicKey,
        player: playerTwo.publicKey,
      })
      .signers([playerTwo]) // Player Two must sign
      .rpc();
      
    const gameData = await program.account.game.fetch(game.publicKey);

    // Assert that the state updated correctly
    assert.ok(gameData.turn === 1, "Turn should now be 1 for White");
    assert.ok(gameData.board.startsWith("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w"), "Board state did not update correctly after P2's move");
  });
});