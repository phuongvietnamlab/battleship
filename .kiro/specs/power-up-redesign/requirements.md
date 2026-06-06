# Requirements Document

## Introduction

Complete redesign of the power-up system in Battleship Online. The current "Advance" mode with random power-up spawning and mid-match shop is replaced by a deterministic, skill-based system where players purchase up to 2 power-ups during the placement phase before battle begins. The redesign removes the dual-mode architecture (Classic/Advance), eliminates RNG-heavy mechanics, and introduces 4 refined power-ups that reward strategic decision-making.

## Glossary

- **Game_Server**: The Node.js WebSocket server managing room state, game logic, and player communication
- **Client**: The React front-end application running in the player's browser
- **Placement_Phase**: The pre-battle phase where players arrange ships on their board and optionally purchase power-ups
- **Battle_Phase**: The active game phase where players take turns firing at the opponent's board
- **Power_Up_Shop**: The UI component displayed during the Placement_Phase allowing power-up purchases
- **Stake**: The wagered currency amount set when creating or joining a match
- **Wallet**: The player's in-game currency balance stored server-side
- **Inventory**: The set of power-ups a player has purchased for the current match (max 2)
- **Sonar_Ping**: A power-up that reveals whether a chosen row or column contains any ship cells (YES/NO only)
- **Cross_Missile**: A power-up that fires at a center cell plus its 4 orthogonal neighbors simultaneously
- **Decoy**: A power-up placed on an empty cell of the player's own board during Placement_Phase that appears as a hit to the opponent
- **Scatter_Blast**: A power-up that fires at 2-3 random unshot cells on the opponent's board
- **Authenticated_User**: A player who has signed in and has an associated Wallet

## Requirements

### Requirement 1: Remove Advance Mode

**User Story:** As a player, I want a single unified game mode, so that matchmaking is simpler and the community is not split between modes.

#### Acceptance Criteria

1. THE Game_Server SHALL support only one game mode without any mode selection parameter during room creation or queue join
2. WHEN a room is created with a mode field in the request payload, THE Game_Server SHALL ignore the mode field and create the room without returning an error to the client
3. THE Client SHALL not display mode selection UI (Classic/Advance toggle) on the room creation, matchmaking, or bot-play screens
4. THE Game_Server SHALL not execute power-up spawning logic during the Battle_Phase
5. IF the Game_Server receives a buyPowerup event during a match, THEN THE Game_Server SHALL reject the request and SHALL not modify any game state
6. WHEN the Game_Server matches players from the queue, THE Game_Server SHALL not use a mode preference as a matching criterion

### Requirement 2: Power-Up Purchase During Placement Phase

**User Story:** As a player, I want to buy power-ups before the battle starts, so that I can make strategic decisions without time pressure during combat.

#### Acceptance Criteria

1. WHILE the Placement_Phase is active AND the Stake is greater than zero, THE Power_Up_Shop SHALL display the 4 available power-up types (Sonar_Ping, Cross_Missile, Decoy, Scatter_Blast) to Authenticated_Users with each item's price
2. WHEN a player selects a power-up in the Power_Up_Shop, THE Game_Server SHALL debit the player's Wallet by 10% of the match Stake rounded to the nearest integer
3. THE Game_Server SHALL limit each player to a maximum of 2 power-up purchases per match
4. WHEN a player has purchased 2 power-ups in the current match, THE Power_Up_Shop SHALL display a "Max reached" indicator and disable further purchase interactions
5. IF a player's Wallet balance is less than the power-up price for the current match, THEN THE Power_Up_Shop SHALL display the power-ups as non-purchasable with an indication of insufficient balance
6. WHEN the Stake equals zero, THE Power_Up_Shop SHALL not be displayed
7. WHEN a player is not authenticated (guest), THE Power_Up_Shop SHALL not be displayed
8. WHEN a power-up purchase succeeds, THE Game_Server SHALL add the purchased power-up to the buyer's Inventory and emit an updated balance to the buyer

### Requirement 3: Power-Up Purchase Secrecy

**User Story:** As a player, I want my power-up purchases hidden from my opponent, so that strategic surprise is preserved.

#### Acceptance Criteria

1. THE Game_Server SHALL not transmit power-up purchase type or quantity information to the opponent's Client
2. WHILE the Placement_Phase is active, THE Game_Server SHALL not emit any event to the opponent when a player purchases a power-up
3. WHILE the Battle_Phase is active, THE Client SHALL not display the opponent's Inventory contents
4. WHEN a player reconnects during the Battle_Phase, THE Game_Server SHALL exclude the opponent's Inventory from the game state payload sent to the reconnecting Client
5. WHEN a power-up is activated, THE Game_Server SHALL reveal only the resulting effect (cells fired, scan result) to the opponent without disclosing the activating player's remaining Inventory

### Requirement 4: Sonar Ping Power-Up

**User Story:** As a player, I want to scan a row or column for ship presence, so that I can gather strategic information at the cost of a turn.

#### Acceptance Criteria

1. WHEN a player activates Sonar_Ping, THE Client SHALL prompt the player to choose either a row (A-K) or a column (1-11)
2. IF the player dismisses the Sonar_Ping selection prompt without choosing, THEN THE Client SHALL cancel the activation and return to the normal turn state without consuming the power-up or the turn
3. WHEN the player selects a row or column, THE Game_Server SHALL determine whether any opponent ship cells (including cells already hit) exist in that row or column on the opponent's board
4. WHEN one or more ship cells exist in the selected row or column, THE Game_Server SHALL respond with "YES" to the activating player only
5. WHEN no ship cells exist in the selected row or column, THE Game_Server SHALL respond with "NO" to the activating player only
6. THE Game_Server SHALL not reveal the count or positions of ship cells in the scanned row or column
7. IF a player attempts to activate Sonar_Ping when it is not in their Inventory, THEN THE Game_Server SHALL reject the request and return a NO_POWERUP error code
8. IF a player attempts to activate Sonar_Ping when it is not their turn, THEN THE Game_Server SHALL reject the request and return a NOT_YOUR_TURN error code
9. WHEN Sonar_Ping is successfully activated, THE Game_Server SHALL consume the player's turn without firing at any cell and advance the turn to the opponent

### Requirement 5: Cross Missile Power-Up

**User Story:** As a player, I want to fire in a cross pattern hitting 5 cells at once, so that I can maximize damage in a suspected ship area.

#### Acceptance Criteria

1. WHEN a player activates Cross_Missile, THE Client SHALL prompt the player to select a target cell on the opponent's board
2. WHEN the player selects a target cell, THE Game_Server SHALL fire at the target cell and its 4 orthogonally adjacent cells (up, down, left, right), producing up to 5 individual hit-or-miss results
3. IF any adjacent cell is outside the board boundary (11×11 grid), THEN THE Game_Server SHALL skip that cell and fire only at valid cells
4. IF any cell in the cross pattern has already been shot, THEN THE Game_Server SHALL skip that cell without additional effect and not count it as a new shot
5. WHEN Cross_Missile is activated, THE Game_Server SHALL decrement the player's Cross_Missile Inventory count by 1
6. IF the player's Cross_Missile Inventory count is 0, THEN THE Game_Server SHALL reject the activation and return a NO_POWERUP error code without consuming the player's turn
7. WHEN Cross_Missile is activated, THE Game_Server SHALL consume the player's turn regardless of hit/miss results

### Requirement 6: Decoy Power-Up

**User Story:** As a player, I want to place a fake target on my board, so that my opponent wastes turns hunting a non-existent ship.

#### Acceptance Criteria

1. WHEN a player purchases a Decoy during the Placement_Phase, THE Client SHALL require the player to place exactly 1 Decoy on a single empty cell that is not occupied by any ship cell before confirming ready
2. IF the player attempts to place a Decoy on a cell occupied by a ship, THEN THE Game_Server SHALL reject the placement and return an error indicating the cell is unavailable
3. WHEN the opponent fires at the Decoy cell, THE Game_Server SHALL report the result as a hit to the opponent
4. THE Game_Server SHALL not reveal to the opponent that the hit was a Decoy rather than a ship at any point during the match
5. THE Game_Server SHALL not count the Decoy cell toward ship sinking or win/loss conditions
6. THE Decoy SHALL remain on the board for the entire match duration without expiring or being removed
7. WHEN all 5 real ships are sunk, THE Game_Server SHALL declare the match over regardless of Decoy status
8. THE Game_Server SHALL allow a maximum of 1 Decoy per player per match (even if player purchases 2 power-ups, at most 1 can be Decoy)

### Requirement 7: Scatter Blast Power-Up

**User Story:** As a player, I want to fire at multiple random cells, so that I can probe the board when I lack targeting information.

#### Acceptance Criteria

1. WHEN a player activates Scatter_Blast, THE Game_Server SHALL select 2 to 3 unshot cells uniformly at random from the opponent's board and fire at all selected cells
2. THE Game_Server SHALL report each cell's result (hit or miss) to the activating player and notify the opponent of the incoming shots
3. IF fewer than 2 unshot cells remain on the opponent's board, THEN THE Game_Server SHALL fire at all remaining unshot cells
4. IF zero unshot cells remain on the opponent's board when Scatter_Blast is activated, THEN THE Game_Server SHALL reject the activation and preserve the player's Scatter_Blast Inventory count
5. WHEN Scatter_Blast is activated, THE Game_Server SHALL consume the player's turn regardless of hit/miss results
6. IF the player's Scatter_Blast Inventory count is zero, THEN THE Game_Server SHALL reject the activation and return a NO_POWERUP error code
7. THE Game_Server SHALL select target cells uniformly at random among all unshot cells without player input

### Requirement 8: Power-Up Shop UI Layout

**User Story:** As a player, I want the power-up shop integrated into the placement screen, so that purchasing feels natural and does not require extra navigation.

#### Acceptance Criteria

1. THE Client SHALL display the Power_Up_Shop as a horizontal row of all 4 power-up options (Sonar_Ping, Cross_Missile, Decoy, Scatter_Blast), each showing its icon, name, and price, below the ship arrangement area and above the Ready button
2. WHEN a power-up is selected, THE Client SHALL visually indicate the selection with a highlight or badge showing purchase count
3. WHEN the player has purchased 2 power-ups, THE Client SHALL display a "Max reached" indicator and disable all purchase buttons in the Power_Up_Shop
4. THE Client SHALL display the price per power-up as 10% of the current match Stake rounded to the nearest integer, suffixed with the points currency label
5. WHEN a Decoy is purchased, THE Client SHALL enter a Decoy placement mode that disables the Ready button and other shop interactions until the player taps a valid empty cell on their own board or cancels the placement
6. IF the player taps a cell occupied by a ship during Decoy placement mode, THEN THE Client SHALL reject the placement, display an error message indicating the cell is not empty, and remain in Decoy placement mode
7. WHEN the player cancels Decoy placement mode, THE Client SHALL refund the purchase, remove the Decoy from the player's Inventory, and return to normal placement state

### Requirement 9: Battle Phase Inventory Display

**User Story:** As a player, I want to see and activate my purchased power-ups during battle, so that I can use them at the optimal moment.

#### Acceptance Criteria

1. WHILE the Battle_Phase is active AND the player has purchased power-ups, THE Client SHALL display the player's power-ups in a PowerBar component showing each purchased type with its icon
2. WHEN it is the player's turn, THE Client SHALL enable activation buttons for each power-up type where the player's Inventory count for that type is greater than 0
3. WHEN it is not the player's turn, THE Client SHALL disable all power-up activation buttons regardless of Inventory count
4. WHEN a power-up is consumed, THE Client SHALL remove that power-up from the displayed Inventory (since max is 2 and each is one-use)
5. WHILE the Battle_Phase is active, THE Client SHALL display only the current player's own Inventory (not the opponent's)
6. IF the server rejects a power-up activation, THEN THE Client SHALL keep the Inventory unchanged and display an error message indicating the reason for failure

### Requirement 10: Legacy System Removal

**User Story:** As a developer, I want all legacy advance-mode code removed, so that the codebase is simplified and does not contain dead paths.

#### Acceptance Criteria

1. THE Game_Server SHALL remove the `maybeSpawn` function, its call sites, and the associated spawn-probability constant
2. THE Game_Server SHALL remove the `buyPowerup` socket event handler and its associated rate limiter
3. THE Game_Server SHALL remove all conditionals that branch on a mode value of "advance", such that the server no longer recognizes a mode parameter
4. THE Client SHALL remove the mid-match shop UI component, the `handleBuyPowerup` function, and associated state variables (`showShop`, `purchasesRemaining`, `powerupPrice`, `oppBoughtNotice`)
5. THE Client SHALL remove the mode selection toggle from the lobby, the `mode` state from room creation flow, and the mode parameter from `createRoom` and `joinQueue` socket emissions
6. THE Client SHALL remove advance-mode localization strings and the advance-mode conditional rendering of the PowerBar component
7. THE Game_Server SHALL retain the `mode` column in the `matches` database table and continue to display historical advance-mode match records in match history without error

### Requirement 11: Power-Up Pricing Validation

**User Story:** As a system operator, I want power-up pricing enforced server-side, so that players cannot manipulate purchase costs.

#### Acceptance Criteria

1. THE Game_Server SHALL calculate the power-up price as exactly 10% of the match Stake, rounded to the nearest integer
2. IF a power-up purchase request is received and the match Stake equals zero, THEN THE Game_Server SHALL reject the request and return a ZERO_STAKE error code
3. IF a power-up purchase request is received from an unauthenticated player, THEN THE Game_Server SHALL reject the request and return a GUEST_NO_WALLET error code
4. IF the player's Wallet balance is less than the calculated price, THEN THE Game_Server SHALL reject the purchase and return an INSUFFICIENT_BALANCE error code
5. THE Game_Server SHALL debit the Wallet and grant the power-up to the Inventory within a single atomic transaction, such that either both the debit and the grant succeed or neither is applied
6. IF the player has already purchased 2 power-ups in the current match, THEN THE Game_Server SHALL reject the purchase and return a PURCHASE_CAP_REACHED error code
