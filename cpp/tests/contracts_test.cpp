#include <contracts.hpp>

#include <cctype>
#include <cstdlib>
#include <iostream>
#include <string_view>

namespace
{
void require(bool condition, const char *message)
{
    if (!condition)
    {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

bool looks_like_address(std::string_view value)
{
    if (value.size() != 42 || value.substr(0, 2) != "0x")
    {
        return false;
    }
    for (const char c : value.substr(2))
    {
        if (!std::isxdigit(static_cast<unsigned char>(c)))
        {
            return false;
        }
    }
    return true;
}
} // namespace

int main()
{
    namespace c = polyarb::contracts;
    for (const auto address : {c::kCtf, c::kNegRiskAdapter, c::kLegacyCtfExchange, c::kLegacyNegRiskCtfExchange,
                               c::kLegacyUsdcE, c::kV2CtfExchange, c::kV2NegRiskCtfExchange, c::kV2Pusd})
    {
        require(looks_like_address(address), "address must be 0x plus 40 hex digits");
    }

    // The adapter and the V1 neg-risk exchange are different contracts. Treating
    // them as one address was a real bug in the legacy redemption path.
    require(c::kNegRiskAdapter != c::kLegacyNegRiskCtfExchange, "adapter must differ from the neg-risk exchange");
    require(c::kLegacyCtfExchange != c::kV2CtfExchange, "V1 and V2 exchanges must differ");
    std::cout << "contracts_test passed\n";
    return 0;
}
