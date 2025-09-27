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

  // Fund Player Two with some SOL so they can pay for future transactions if needed
  before(async () => {
    const airdropTx = await provider.connection.requestAirdrop(
      playerTwo.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
    );
    // Use the modern way to confirm the transaction
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });
  });

  it("Initializes a new game!", async () => {
    // Define the stake amount for the game (e.g., 0.1 SOL)
    const stakeAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

    // Call the initialize_game instruction on our program
    await program.methods
      .initializeGame(playerTwo.publicKey, stakeAmount)
      .accounts({
        game: game.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([game]) // The game account Keypair must sign because we are creating it
      .rpc();

    // Fetch the state of the game account from the blockchain
    const gameData = await program.account.game.fetch(game.publicKey);

    // Assert that the game's state is correct after initialization
    assert.ok(gameData.turn === 1, "Turn should be 1 for White");
    assert.ok(gameData.players[0].equals(playerOne.publicKey), "Player One is not set correctly");
    assert.ok(gameData.players[1].equals(playerTwo.publicKey), "Player Two is not set correctly");
    assert.ok(gameData.state.hasOwnProperty('active'), "Game state should be Active");
    assert.ok(gameData.board === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Board is not in the starting position");
    assert.ok(gameData.stakeAmount.eq(stakeAmount), "Stake amount is incorrect");
  });

  it("Allows a player to make a valid move!", async () => {
    // Player One (White) makes the classic opening move "e4"
    await program.methods
      .makeMove("e4")
      .accounts({
        game: game.publicKey,
        player: playerOne.publicKey,
      })
      .signers([]) // No extra signers needed, playerOne is the test's default signer
      .rpc();

    // Fetch the game state again
    const gameData = await program.account.game.fetch(game.publicKey);

    // Assert that the state updated correctly after the move
    assert.ok(gameData.turn === 2, "Turn should now be 2 for Black");
    // This is the FEN string for the board after the move e4
    assert.ok(gameData.board === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "Board state did not update correctly");
  });

  it("Prevents the wrong player from making a move!", async () => {
    // It is now Player Two's turn. We will try to make a move with Player One.
    try {
      await program.methods
        .makeMove("d4") // Some random move
        .accounts({
          game: game.publicKey,
          player: playerOne.publicKey,
        })
        .rpc();
      
      // If the line above does not throw an error, we force the test to fail.
      assert.fail("The transaction should have failed but did not.");
    } catch (error) {
      // We expect the program to throw an error.
      // We check if the error message is the one we defined in our Rust code.
      assert.include(error.toString(), "It is not your turn to move.");
    }
  });
});
