use anchor_lang::prelude::*;
use std::str::FromStr;


declare_id!("DNZxPFmGYe8K17RQ4g2VaAcasvBwGUeq8CYLDshCDGnB");

#[program]
pub mod contract {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>, player_two: Pubkey, stake_amount: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        game.players = [ctx.accounts.player_one.key(), player_two];
        game.turn = 1;
        game.board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string();
        game.state = GameState::Pending; // NEW: Set initial state to Pending
        game.stake_amount = stake_amount;
        Ok(())
    }

    // NEW: Function for Player 2 to join
    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require_keys_eq!(ctx.accounts.player_two.key(), game.players[1], ChessError::NotPlayerTwo);
        game.state = GameState::Active; // Set state to Active
        Ok(())
    }

    // pub fn make_move(ctx: Context<MakeMove>, move_uci: String) -> Result<()> {
    //     let game = &mut ctx.accounts.game;
    //     let player_index = game.turn - 1;
    //     require_keys_eq!(game.players[player_index as usize], ctx.accounts.player.key(), ChessError::NotPlayerTurn);
    //     require!(game.state == GameState::Active || game.state == GameState::Check, ChessError::GameNotActive);

    //     let mut chess_pos: Chess = Fen::from_str(&game.board).unwrap().into_position(CastlingMode::Standard).unwrap();
        
    //     // UPDATED: Parse the move from UCI format (e.g. "e2e4")
    //     let uci_move = UciMove::from_ascii(move_uci.as_bytes())
    //         .map_err(|_| ChessError::InvalidMoveFormat)?;

    //     let mv = uci_move.to_move(&chess_pos)
    //         .map_err(|_| ChessError::IllegalMove)?;

    //     require!(chess_pos.is_legal(&mv), ChessError::IllegalMove);
    //     chess_pos.play_unchecked(&mv);
    //     game.board = Fen::from_position(chess_pos.clone(), shakmaty::EnPassantMode::Legal).to_string();
    //     game.turn = if game.turn == 1 { 2 } else { 1 };

    //     let color = if game.turn == 1 {shakmaty::Color::White} else {shakmaty::Color::Black};

    //     if chess_pos.is_checkmate() {
    //         game.state = GameState::Checkmate { winner: ctx.accounts.player.key() };
    //     } else if chess_pos.is_stalemate() || chess_pos.has_insufficient_material(color) {
    //         game.state = GameState::Draw;
    //     } else if chess_pos.is_check() {
    //         game.state = GameState::Check;
    //     } else {
    //         game.state = GameState::Active;
    //     }
    //     Ok(())
    // }


     // NEW: Function to settle the game and determine the winner
    pub fn report_game_result(ctx: Context<SettleGame>, winner: Pubkey) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        // --- Security Checks ---
        // 1. Ensure the game is actually active and not already finished.
        require!(game.state == GameState::Active, ChessError::GameNotActive);
        
        // 2. Ensure the person reporting the result is one of the players.
        let reporter = ctx.accounts.player.key();
        require!(game.players.contains(&reporter), ChessError::NotAPlayer);

        // 3. Ensure the declared winner is also one of the players.
        require!(game.players.contains(&winner), ChessError::NotAPlayer);

        // --- State Update ---
        game.state = GameState::Finished { winner };

        // In a real application, you would add logic here to transfer the stake_amount
        // from a vault account to the winner's account.

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(init, payer = player_one, space = 8 + 32 + 32 + 1 + (4 + 90) + 32 + 8)] // Estimate space
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player_one: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// NEW: Context for join_game
#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub player_two: Signer<'info>,
}

// NEW: Context for the settlement instruction
#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub player: Signer<'info>,
}

// #[derive(Accounts)]
// pub struct MakeMove<'info>{
//     #[account(mut)]
//     pub game : Account<'info , Game>,
//     pub player : Signer<'info>,
// }

#[account]
pub struct Game {
    pub players: [Pubkey; 2],
    pub turn: u8,
    pub board: String,
    pub state: GameState,
    pub stake_amount: u64,
}

// UPDATED: Simplified GameState enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GameState {
    Pending,
    Active,
    Finished { winner: Pubkey },
    Draw,
}

#[error_code]
pub enum ChessError {
    GameNotActive,
    NotPlayerTwo,
    NotAPlayer, // Added this required error
}