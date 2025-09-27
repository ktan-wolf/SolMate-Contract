use anchor_lang::prelude::*;
use shakmaty::{Chess , Position , Move , san::San};
use shakmaty::fen::Fen;
use shakmaty::CastlingMode;
use std::str::FromStr;

declare_id!("DNZxPFmGYe8K17RQ4g2VaAcasvBwGUeq8CYLDshCDGnB");

#[program]
pub mod contract {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>, player_two: Pubkey, stake_amount: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        game.players = [ctx.accounts.player_one.key(), player_two];
        game.turn = 1; // 1 for White, 2 for Black. White always starts.
        // This is the FEN string for the starting position in chess
        game.board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string();
        game.state = GameState::Active;
        game.stake_amount = stake_amount;
        Ok(())
    }

    // Inside the #[program] block
    pub fn make_move(ctx: Context<MakeMove>, move_str: String) -> Result<()> {
        let game = &mut ctx.accounts.game;

        // 1. Security Check: Is it the player's turn?
        let player_index = game.turn - 1; // 0 for white, 1 for black
        require_keys_eq!(game.players[player_index as usize], ctx.accounts.player.key(), ChessError::NotPlayerTurn);

        // 2. Parse the board state from the FEN string
        let pos: Chess = Fen::from_str(&game.board).unwrap().into_position(CastlingMode::Standard).unwrap();
        let mut chess_pos = pos.clone();

        // 3. Parse the move from Standard Algebraic Notation (e.g., "Nf3") or UCI ("g1f3")
        // Note: For simplicity, we'll use SAN. UCI is also an option.
        let san_move = San::from_str(&move_str).unwrap();
        let mv = san_move.to_move(&chess_pos).unwrap();

        // 4. THE MAGIC: Check if the move is legal
        require!(chess_pos.is_legal(&mv), ChessError::IllegalMove);

        // 5. Apply the move
        chess_pos.play_unchecked(&mv);

        // 6. Update the game state
        game.board = Fen::from_position(chess_pos.clone(), shakmaty::EnPassantMode::Legal).to_string();
        game.turn = if game.turn == 1 { 2 } else { 1 }; // Switch turns

        // 7. Check for game-ending conditions
        if chess_pos.is_checkmate() {
            game.state = GameState::Checkmate { winner: ctx.accounts.player.key() };
        } else if chess_pos.is_stalemate() || chess_pos.is_insufficient_material() {
            game.state = GameState::Draw;
        } else if chess_pos.is_check() {
            game.state = GameState::Check;
        } else {
            game.state = GameState::Active;
        }

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

#[derive(Accounts)]
pub struct MakeMove<'info>{
    #[account(mut)]
    pub game : Account<'info , Game>,
    pub player : Signer<'info>,
}

#[account]
pub struct Game {
    pub players: [Pubkey; 2],
    pub turn: u8,
    pub board: String,
    pub state: GameState,
    pub stake_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GameState {
    Active,
    Check,
    Checkmate { winner: Pubkey },
    Draw,
}

#[error_code]
pub enum ChessError {
    #[msg("It is not your turn to move.")]
    NotPlayerTurn,
    #[msg("The move you entered is not legal.")]
    IllegalMove,
}