import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getVaultId } from "../../../scripts/utils/helpers";
import { buyTokensWithTokens, computeHarvestAt } from "../../utils/gen-utils";
import Decimal from "decimal.js";
import logger from "../../utils/logger";
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
//this file should eventually test all the core features of the strategy
export function shouldBehaveLikeStrategyDuringAndRedeem(): void {
  before(
    "should revert to invested evm snapshot if snapshot exists",
    async function () {
      if (this.investedVaultSnapshot) {
        logger.debug(
          `Latest block timestamp before revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
        let revertStatus = await this.provider.send("evm_revert", [
          this.investedVaultSnapshot,
        ]);
        this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
        logger.debug(
          `Revert to ${this.investedVaultSnapshot} status: ${revertStatus}`
        );
        logger.debug(
          `Latest block timestamp after revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
      }
      await this.vault.claim(this.vaultId, 0);

      const OriginalsellTokenBalanceBeforeTx = ethers.BigNumber.from(
        await this.sellTokenContract.balanceOf(this.accounts[0])
      )
        .div(
          new Decimal(10)
            .pow(await this.sellTokenContract.decimals())
            .toString()
        )
        .toString();
      const OriginalbuyTokenBalanceBeforeTx = ethers.BigNumber.from(
        await this.buyTokenContract.balanceOf(this.accounts[0])
      )
        .div(
          new Decimal(10).pow(await this.buyTokenContract.decimals()).toString()
        )
        .toString();

      console.log(
        "Original sellTokenBalanceBeforeTx",
        OriginalsellTokenBalanceBeforeTx
      );
      console.log(
        "Original buyTokenBalanceBeforeTx",
        OriginalbuyTokenBalanceBeforeTx
      );

      for (let i = 0; i < 10; i++) {
        await buyTokensWithTokens(
          this.signers[0],
          this.accounts[0],
          this.buyTokenWithTokenPath,
          this.jrToTrade,
          this.srToTrade,
          0,
          this.routerContract,
          this.sellTokenContract,
          this.buyTokenContract,
          true
        );

        // await buyTokensWithTokens(
        //   this.signers[0],
        //   this.accounts[0],
        //   await this.buyTokenWithTokenPath.reverse(),
        //   this.srToTrade - this.srToTradeDelta,
        //   this.jrToTrade,
        //   0,
        //   this.routerContract,
        //   this.buyTokenContract,
        //   this.sellTokenContract,
        //   true
        // );
        // this.buyTokenWithTokenPath.reverse();
      }

      const sellTokenBalanceBeforeTx = ethers.BigNumber.from(
        await this.sellTokenContract.balanceOf(this.accounts[0])
      )
        .div(
          new Decimal(10)
            .pow(await this.sellTokenContract.decimals())
            .toString()
        )
        .toString();
      const buyTokenBalanceBeforeTx = ethers.BigNumber.from(
        await this.buyTokenContract.balanceOf(this.accounts[0])
      )
        .div(
          new Decimal(10).pow(await this.buyTokenContract.decimals()).toString()
        )
        .toString();
      console.log("sellTokenBalanceBeforeTx", sellTokenBalanceBeforeTx);
      console.log("buyTokenBalanceBeforeTx", buyTokenBalanceBeforeTx);
    }
  );
  it("should not redeem if the slippage is too high", async function () {
    let vaultToBeRedeemedAt =
      this.vaultParams.startTime +
      this.vaultParams.enrollment +
      this.vaultParams.duration;
    await this.provider.send("evm_mine", [vaultToBeRedeemedAt + 10000]);
    const amountsRedeemed = await this.vault.callStatic.redeem(
      this.vaultId,
      0,
      0
    );
    await expect(
      this.vault.redeem(
        this.vaultId,
        amountsRedeemed[0] + 1,
        amountsRedeemed[1] + 1
      )
    ).to.be.revertedWith("Too much slippage");
  });
  it("should increase both sr and jr values on redeem", async function () {
    logger.debug(
      `Redeem Block time: ${new Date(
        (await this.provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    const amountsRedeemed = await this.vault.callStatic.redeem(
      this.vaultId,
      0,
      0
    );
    const seniorAmountRedeemed = ethers.BigNumber.from(
      amountsRedeemed[0].toString()
    ).div(this.srDecimalsFactor);
    const juniorAmountRedeemed = ethers.BigNumber.from(
      amountsRedeemed[1].toString()
    ).div(this.jrDecimalsFactor);
    await this.vault.redeem(this.vaultId, 0, 0);
    logger.info(
      `${await this.seniorTokenContract.symbol()} Redeemed: ${seniorAmountRedeemed}, ${await this.juniorTokenContract.symbol()}  Redeemed: ${juniorAmountRedeemed}`
    );
    expect(seniorAmountRedeemed).gte(this.seniorInvested);
    if (this.juniorsLoseAll) {
      expect(juniorAmountRedeemed).eq(0);
    } else {
      if (this.juniorLoses) {
        expect(juniorAmountRedeemed).lt(this.juniorInvested);
      } else {
        expect(juniorAmountRedeemed).gt(this.juniorInvested);
      }
    }
  });
}
