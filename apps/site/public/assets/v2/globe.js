/* Gotham Consult · hero globe
   A light, dependency-free canvas globe: land dots, Ghana in gold, and live arcs from Accra to the
   cities our partners and investors come from. Built for phones first:
   - Canvas 2D (works on every iPhone and Android browser, no WebGL needed)
   - half the dots and fewer arcs on small screens, pixel ratio capped at 2
   - stops drawing when off screen or in a background tab
   - one still frame when the visitor prefers reduced motion */
(() => {
  const LAND = '9Wv0TvRl81fzbvOq80nyYPJS8WnxpfFb8EzwifDF8GPwVe9s70fvXu9Q74zuyO5n7ljub+1h7TztU+1q7UXsXOyv7GXsP+xW68/rbeuq61/rOurJ6mjqQ+pa6unqxOpj6T3pL+nN6WvpqOm/6V3oKujH6GboWOhv6MLoYOfZ52nnpee851vn0+Yo5sXmZOYw5s7mbeZH5uXmwOZe5jnm1+Wy5cnlZ+VC5brlWeU05dHlS+Xo5cPlYuUA5D3k2uS15C7kzORr5KfkReTj5L7kXOTV5BLksORO5OzkxuRl493juOOT4zLjz+NJ4+bjweNg49jjFePv48riaOLh4rziWuKW4jXi0+IQ4kzi6uIn4sTiY+I+4tviGeK24vLikeIw4s3ibOHk4SHhv+Fe4fvhOOHW4RPhseHt4YzhKuHI4WbhQeHf4RzhuuH24ZThM+HR4Q7gq+Do4CXgwuBh4P/g2eAX4PDgj+Au4MvgauCm4EXg4uAf4L3gXOD54JjgNuDU4BHgr+BN4OvfKN/G32TfA98/393fGt+33/Tfkt8x387fDN+p3+XfI9/A31/f/N+b3zrf198U37LfUd/u343fK9/J3qTeQt7g3h3eu9733pbeNN7S3g/erd7p3ibexN5i3gHePd7b3hjetd7y3pDeL97M3qfe490h3b7dXd363Tjd1d0S3bDdT93s3YvdKd3H3QTdot1A3d7dG9253fXdlN0y3dDdDd2r3efdJN3C3WDd/t2c3Tvc2dwW3LPcUtzw3I7cLdzK3KXc4dwf3LzcW9z43JfcNtzT3HLcENyu3E3c6tyJ3Cfcxdyg3D7c3NwZ3Lfc89yR2zDbztsL26jb5dsi27/bXtv825rbOdvW23XbFNux21Db7duM2yvbyNuj29/bHNu62/bbldsz29HbDtus2+jaJdrD2mHanto82traF9q12vHaLtrM2qba49og2r3aXNr62pjaN9rU2nPaEtqv2k7a69qK2inaxtqh2t3aGtq42fTZk9kx2c/ZqtlI2ebZI9nB2V/Z/dmc2TrZ2NkV2bPZUdnv2SzZytmk2eHZHtm72fjZltk12dLZENmt2enYiNgn2MTYn9g+2NvYGNi22PLYkdgv2M3YqNjk2CHYv9hd2PvYmdg42NbYE9iw2E/Y7diL2CrYx9ii2N7YHNi51/XXlNcz19DXDder10rX59eG1yTXwtdh153XO9fZ1xbXtNct18vXptfi1x/Xvdf515fXNtfU1xHXrtfr14nXKNfF1qDW3NYa1rfWktYx1s7WC9ap1uXWItbA1l/Wm9Y51tfWFNay1u7WK9bJ1qTW4NYd1rvW99aV1jTW0tUP1azVS9Xp1YfVJtXD1Z7V2tW11ZDVL9XM1afV49Ug1b7VmdU31dXVEtWw1ezVitUp1cfVodXe1bjUMtTP1KrUSdTm1IXUJNTB1JzUO9TY1LPUUtQs1MrUpdTh1B7UvNSX1DXU09QQ1K7UTNSI1CfUxdSf09zTttPz05HTMNPN06jTItO/05rTOdPW07HTjNMq08jTo9Pf07rTldMz09HTrNNK0iXSw9Kd0jzS2tK00lPS8dKP0i7Sy9Km0uLSvdKY0jfS1NIR0q/STdKK0ijSxtKh0t3SuNKS0jHSz9Kp0SPRwNGb0TrR19Gy0VHRLNHJ0aTR4NG70ZbRNNHS0a3RS9Em0cTRn9E90dvRttHy0S/RzdCn0L7QmdA40NXQE9Cw0E/Qi9Aq0MfQotDe0H3QudCU0DLQ0NCr0EnQhtAk0MLQndA70NnQtNBS0PDQLdDLz6XPvM+XzzbP08+uz03Pic8nz8XPoM8+z9zPt8+SzzDPzs+pz0fPIs/Az5rPOc/Xz7HPUM8rz8jOo85Czt/Ofs66zpXONM7Rzg7OrM5LzofOJc7Dzp7OPM7azrXOU87xzpDOLs7MzqfOvs6YzjfO1c6vzk7Ois4pzsbNoc1Azd3NfM24zZPNMs3PzarNSc0jzcHNnM06zdjNs81Rze/NLM3KzaXNQ828zZbNNc3Tza3NTM0nzcTNn8w+zNvMesy2zFXMkcwvzM3MCsyozCHMv8yazDjM1syxzE/Mi8wqzMjMosxBzN/MucyUzDPM0MyrzErMhswlzMLMncw8zNnLtMtTy/DLj8sty8vLpstEy+LLvcuYyzbL1Muvy03Licsoy8bLoMs/y93Lt8tWy5LLMcvOy6nLSMuEy8DLm8s6y9fLsstRy+7KjcorysnKpMpCyuDKf8q7ypbKNMrSyq3KS8qHyibKxMqeyj3K28p5yrXKVMqQyi/KzMqnykbK48q+ypnKN8rVyrDKTsqLyinKx8oEyaLJQMneyXzJuclXyZPJMsnQyarJScmFycHJnMk7ydjJs8lSye/JjsktycrJpclEyeHJgMm8yZfJNcnTya7JTMmJySfJxcmgyT7J3Mm3yFXIkcgwyM7IqMjlyIPIv8iayDnI1sixyFDIjMgryMjIo8hCyN/Ifsi6yJXIM8jRyKzISsiHyMPInsg8yNrItchTyI/ILsjMx6bHRcfix4HHvceYxzfH1Mevx07Hiscox8bHocc/x93HuMeTxzHHz8eqx0jHhMfBx5vHOsfYx7LHjccsx8nHpMdDx+DHu8aWxjXG0satxkzGiMYmxsTGn8Y9xtvGtsaRxi/GzcaoxkbGgsa/xpnGOMbWxrDGT8aLxirGx8aixkHG3sa5xljGlMYzxtDGq8ZKxYbFwsWdxTvF2cW0xY/FLcXLxabFRMXixYDFvcWXxTbF08WuxU3FicUoxcXFoMU/xdzFt8WSxTDFzsWpxUfFhMXAxZvFOcXXxLLEUMSMxCvEycSjxELE4MR+xLrEWcSVxDTE0cSsxEvEh8TDxJ7EPcTaxLXEkMQuxMzEp8RFxILEvsSZxDfE1cSwxIrEKcTHxKHEQMPew7jDV8OTwzLDz8Oqw0nDhcPBw5zDO8PYw7PDUsOOwyzDysOlw0PD4cOAw7zDl8M1w9PDrsNMw4jDxMOfwz7D28O2w5HDMMPNwqjCR8LkwoPCv8KawjjC1sKxwk/CjMIqwsjCo8JBwt/CusJYwpTCM8LRwqvCSsKGwsLCncI8wtnCtMKPwi7Cy8KmwkXCgcK9wpjCNsLUwa/BTcGKwSjBxsGhwT/B3cG4wZLBMcHPwanBSMGEwcDBm8E6wdfBssFRwY3BLMHJwaTBQ8HgwX/Bu8E0wdLBrcFLwYjBxMGewT3B28C1wFTAkMAvwMzAp8BGwILAvsA4wNXAsMBPwIvAKcDHwKLAQMDewLnAlMAywNDAq8BJwIXAwsCcwDvA2cCzwI7ALcDKwKXARMCAwLy/Nr/Tv66/Tb/Fv6C/Pr/cv7e/kr8wv86/qb9Hv4O/wL+avzm/17+xv1C/jL8rv8i/o79Cv9+/ur80v9G/rL9Lv4e/w76evjy+2r61vo++Lr7Mvqa+Rb6Bvr2+N77Uvq++Tr4pvsa+ob5Avt2+uL6TvjG+z76qvki+hb7Bvpy+Or7YvrO+Ub6Nviy+yr6kvkO9f727vTW90r2tvUy9iL3EvZ+9Pr3bvXq9tr2RvS+9zb2ovUa95L2/vTi91r2xvYu9Kr3IvaK9Qb3fvX29ub0zvdC9q71KvcK8nbw8vNm8tLyPvC28y7ymvES8gLy9vDa81LyuvE28ibwovMW8oLw/vNy8e7y3vJK8MbzOvKm8SLzAvDm817yyvCu8ybykvEK7fru7uzS70rusu0u7w7ueuz272ru1u5C7L7vMu6e7Rrvju767N7vVu7C7i7spu8e7ortAu3y7ubuTuzK70Luqu0m7wbo7uti6s7qOui26yrqlukS6gLq8upe6NbrTuq66TLrFup+6Prp6ura6kbowus26qLpHur+6ObrWurG6KrrIuqO6Qbp+urq5lbkzudG5rLlKucO5nbk8udq5tLmPuS65y7mmuUW5vbmYuTe51LmvuSi5xrmhuT+5fLm4uZO5MbnPuaq5SLnBuZu5OrnYuLK4LLjJuKS4Q7h/uLu4lrg1uNK4rbjEuJ+4Pbh5uLa4L7jNuKe4RrjkuL64mbg4uLC4i7gquMe4orhBuH24ubiUuDK40Lert0m3hrfCt523O7fZt7S3jrctt8u3pbdEt7y3l7c2t9O3rrfFt6C3P7d7t7e3MLfOt6m3R7fAt5u3Obeytyu3ybajtkK2fra6tpW2NLbRtqy2w7aetjy22ra1tpC2LrbMtqe2Rbbjtr62mLY3tq+2KbbGtqG2QLZ8tri2k7Yyts+2qrZJtsG2nLU6tdi1s7Ustcq1pbVDtby1lrU1tdO1rbXEtZ+1PrV6tba1MLXNtai1R7W/tZq1OLWxtSq1yLWjtUG1fbW6tZS1M7XRtKu0wrSdtDy0tLSPtC20y7SmtES04rS9tJi0NrTUtK+0xrSgtD+0e7S3tDG0zrSptEi0hLTAtJu0OrSytCu0ybOks0Kzu7M0s9KzrbPEs56zPbPbs7WzL7PMs6ezRrOCs76zmbM4s7CzKbPHs6KzQLO5szKz0LOrs0mzhbPCs5yzO7Kzsi2yyrKlskSy4bKAsryyNbLTsq6yxbKgsj6yt7Iwss6yqLJHsoOyv7KasjmysbIrssiyo7JCst+yurIzstGyrLGHscOxnrE8sdqxtbEuscyxprFFseOxgbG9sTexr7HGsaGxQLHdsXyxuLExsc+xqrFIsYWxwbGcsTqxs7EsscqxpLFDsX+xu7A1sNKwrbDEsJ+wPbC2sC+wzbCosEawgrC/sJmwOLCwsMeworBBsN6wfbC5sDOw0LCrsIawwrCdsDuwtLAtsMuvpq9Er4Cvva82r9Svrq/Fr6CvP697r7evMa/Or6mvSK+Er8Cvm685r7Kvya+kr0Kvfq+7rzSv0a+sr4evw6+erz2vta4ursyup65FroKuvq6Zrjeu1a6wrseuoa5Art6ufK64rjKuz66qroWuwa6crjuus67KrqWuQ66ArryuNa7Trq6uiK7FrZ+tPq16rbatMK3Nraitg62/rZqtOa2xrcito61BrX6tuq0zrdGtq62GrcKtna08rbStj60urcutpq1FrYGtva02rdStr6yKrMasoaw/rHusuKwxrM+sqayErMCsm6w6rLKsyaykrEOsf6y7rJasNKzSrK2siKzErJ+sPax5rLaskKzNrKesgqy+rJmsOKzVq7Cri6vHq6KrQat9q7mrlKsyq9Crq6uGq8KrnKs7q7OrjqvKq6WrRKuAq7yrl6s2q9OrrquJq8WroKs+q3urt6uSqzCrzqupq4OrwKqaqjmqsaqMqsiqo6p+qrqqlao0qtGqrKqHqsOqnqo8qrWqkKouqsyqp6pFqoGqvqqYqjeq1aqvqoqqxqqhqkCqfKq4qpOqMqrPqqqphanBqZypOqmzqY2pyqmkqX+pu6mWqTWp0qmtqYipxKmfqXqptqmRqc2pqKmDqb+pmqk4qdapsamLqcipfam5qZSpM6nQqKuohqjCqJ2oPKi0qI+oy6imqIGovaiYqDao1KivqImoxqigqHuot6iSqDGozqipqISowKibqDqosqiNqMmofqi7qJWoNKfSp6ynh6fDp56neae1p5CnL6fMp6enRqeCp76nmac3p9WnsKeLp8enoqd8p7mnk6cyp9CnqqeFp8GnnKd3p7OnjqfKp6WngKe8ppemNabTpq6miabFpqCmeqa3ppGmMKbOpqimg6a/ppqmOaaxpoymyKZ+prqmlaYzptGmrKaGpsOmnaZ4prSmj6bLpqamgaa9pTel1KWvpYqlxqWhpXyluKWTpc+lqqWEpcGlm6U6pXalsqWNpcmlf6W7pZalNaXSpa2liKXEpZ+leqW2pZGlzaVGpYKlv6Q4pLCki6THpKKkfaS5pJSkMqTQpKukhqTCpJ2kd6S0pI6ky6SApLykl6Q2pNOkrqSJpMWkoKR7pLekkqQwpM6khKTAo5ujOaN1o7KjjKPJo36juqOVozSj0aOHo8OjnqN5o7WjkKPMo6ejgqO+ozejsKOKo8ejoaN8o7ijk6PPo4WjwaKconeis6KOosqif6K8opaiNaLTooiixKKfonqitqKRos2ig6K/ojiidaKxooyiyKKjon2iuqKUotGihqLCoZ2heKG0oY+hy6GmoYGhvaGYoTahiqHGoaGhe6G4oZKhz6GEocChm6E6oXahsqGNocmhpKF/obuhlqE0odKhh6HEoJ6geaC1oJCgzKCnoIKgvqA4oNWgi6DHoKKgfaC5oJSg0KCFoMKgnKB3oLOgjqDKoKWggKC8oJegNqCJoMWgoJ97n7efkp/On6mfR5+Dn8CfOZ91n7GfjJ/In6Offp+6n5Wfh5/Dn56feJ+1n4+fzJ+mn4GfvZ+Ynzefip/Gn6GffJ64npOez55InoWewZ6cnjqedp6zno2eyp6knn+eu56WnhCeiJ7Enp+eep62npGeqJ6DnpqeOJ50noueyJ6inkGefZ65nZSdhp3CnZ2deJ20nY+dy52mnYCdvZ2XnTadEZ2JncWdoJ17nbedkp2pnYSdOZ12nY2dyZ2knX6du52VnIecw5yenHmctZyQnKecgpyZnDeci5zHnKKcQJx8nLick5xJnIWcO5x3nLOcjpzKnKWcgJy8nJecNZtMm4ibxZufm3qbtpuRm82bqJuDmzmbdZuMm8ibo5tBm36bupuVm4abw5udm3ibtJuPm6abgZuYmzebEZtOm4qaxpqhmj+afJq4mpOahJo6mnaajZrJmqSaf5q7mpaaiJrEmp+aeZq2mpCazZqnmoKamZo4mtWaT5qLmseaoplBmX2ZuZmUmYaZO5l3mbSZjpnLmaWZgJmXmU2ZiZnFmaCZP5l7mbeZkpmEmZqZOZl1mYyZyJmjmX6ZupiVmIeYw5iemDyYeZi1mJCYp5iBmJiYipjGmKGYQJh8mLiYk5iFmDqYd5iOmMqYpZh/mJaXiJeflz6Xepe2l5GXg5eal9aXdJeLl8iXopd9l7mXlJeGlzyXeJe0l4+Xy5eBl5iWiZbGlqCWP5Z7lreWkpaElpuWdpaNlsmWpJZ/lpaWh5aelnmWtZaQlsyWgpaZltWWi5bHlqKVQJV8lZOVhZV3lY6VypVElYCVl5WJlcWVoJU+lXqVt5WRlYOVmpV1lYyVyJWjlUKVfpSVlIeUeJS1lI+UzJSBlJiUipTGlKGUP5R8lLiUk5SElJuUdpSNlMmUQ5R/lJaTiJOfk3qTtpORk82TgpOZk9aTdJOLk8eTQZN9k5SThpOdk3iTj5PLk0STgJOXk4mTxZJ7kreSkpKEkpuS15J1koySyZJCkn6SlZKHknmStZKQksySgpKZkoqSfJGTkYWRnJF3kY6RypFDkYCRl5GIkXqRtpGRkYORmpF1kYyRfZGUkIaQnZB4kI+Qy5CBkJiQipDGkHuQuJCSkISQm5B2kI2QyZBDkH+QlpCIj3mPto+Qj82Pgo+Zj0+Pi4+ij32PlI+Fj5yPd4+Oj8qPRI+Aj5ePTY+Jj6CPe4+3jpKOg46ajteOUI6MjqOOfo6VjkuOh46ejnmOkI6BjpiOTo6KjqGOfI6TjYWNnI12jVGNjY1/jZaNTI2IjZ+Neo22jZGNg42ajU+Ni42ijX2NlI1KjYaNnYx4jFOMj4xEjIGMmIxNjImMxYygjHuMkoxIjISMm4xQjI2MfoyVjEuMh4yejHmMVIyQi0aLgouZi06Li4uii3yLuYuTi0mLhYuci9iLd4tSi46LgIuXi0yLiYugi3qLVYuRi4OKmorWilCKjIp+ipWKSoqGip2KeIpTio+KgYqYik6KioqhinyKk4qEipuK2IpRiY2Jf4mWiUyJiImfiXqJVImRiYKJmYlPiYuJx4miiX2JuYmUiUmJhomdidmJUomOiYCIl4hNiImIoIh7iFaIkoiEiJuIUIiMiH6IlYhLiIeInoh5iFSIkIiYh06Hioehh3yHV4eTh0mHhYech1GHjoeWh9OHTIeIh5+HeodVh5GHmodPh4yHyIZYhpSGSoaGhp2GU4aPhpiGTYaJhqCGVoaShoSGm4ZRho2GWYaWhdKFS4WHhcSFnoVUhZCFmYVPhYuFx4VXhZSFSYWchVKFjoVbhZeFTYWJhcWEoIRVhJGEmoRQhIyEyIRZhJWE0YRKhIeEnoRThI+EmIROhIqExoRXg5ODz4Ocg1GDjYNag5aD0oNMg4iDn4NUg5GDmYNPg4uDWIOUg9CDSoKdglKCj4JbgpeCTYKJgsWCVoKSgpuCUIKNgsmCWYKVgtKCS4KHgp6BVIGQgZmBToGKgceBV4GTgc+BSYGcgVKBjoFagZeB04FMgYiBVYGRgc2BR4CagNaAUICMgMiAWICVgNGASoCGgJ2AU4CPgJiATYCKgFaAkoDPgEiAm39Rf41/Wn+Wf9J/S3+If1R/kH9df5l/T3+Lf8d/WH+Uf9B/SX+df1J/jn5bfpd+TX6Jftx+VX6Sfs5+R35efpp+UH6Mfsh+WX6VftF+S36HflN+kH5cfph91X1OfYp93X1XfZN9z31JfWB9nH1RfY59Wn2WfUx9iH1VfZF9Rn1dfZp9T32Lfch8WHyUfNB8SnxTfI984nxbfJh8TXyJfFZ8knzOfEh8X3ybfFF8jXzJfOB8WXuWe9J7S3uHe9p7VHuQe+N7XXuZe057i3vee1d7k3tJe2B7UnuOe8p74Xtbe5d7THuJemN63HpVepF6R3rlel56mnpQeox6yHrfell6lXrRekp6YXpTeo964npceph61HpOeut6inlWeZN5SHnmeV95m3lReY15yXngeVp5lnlMeWN5VHmReUZ55HldeZl5T3mLeVh5lHlKeGF4UniOeOJ4W3iXeE14iXhkeFZ4knhHeOV4XnibeFB4jHhZeJV4S3hid1R3kHfjd1x3mXdOd4p3ZXfed1d3k3dJd+Z3YHdSd453WneWd0x36neId2N3VXeRdkd25HZedpp2T3aMdmZ2WHaUdkp26HZhdlN2j3bLduJ2XHaYdk12inZkdlZ2knbPdkh25nZfdZt1UXWNdVp1lnVLdWJ1VHWQdcx143VddZl1T3WLdWZ1V3WUdUl153VgdVJ1jnThdFt0l3RNdGR0VXSSdM505XRedJp013RQdIx0WXSVdNF0SnTodGF0U3SPc1xzmHPUc05zinNlc1dzk3NIc19zUXONc1pzlnPSc0xzY3NVc5Fz5HNdc5pyT3KLcmZyWHKUckpyYXJSco9yW3KXck1yiXJkclZyknJfcptyUHKNcR1xWXGVcUtx6XFicVRxkHFdcZlx1XFOcYtxZXFXcZNxSXFgcZxxUnGOcVpwl3BMcOpwY3BVcJFw5HBecJpwUHCMcFhwlXBKcGFwU3CPcFxwmHBOb4pvZW9Wb5NvX2+bb1FvjW9ab5ZvS29ib1RvkG9db5lvT2+Lbt5uWG6UbkluYG5Sbo5uW26Xbk1uZG5WbpJu5W5ebptuUG6MbuBuWW6VbUttYm1TbZBtXG2YbU5tim3dbVdtk21gbZxtUW2ObVptlm1MbGNsVWyRbORsXmyabE9sjGyjbN9sWGyUbEpsYWxTbI9sW2yYbE1siWvda1Zrkmtfa5trUWuNa1lrlmtLa2JrVGuQa11rmWtPa4tromvea1drlGpgapxq2GpSao5qW2qXakxqiWpjatxqVWqRauVqXmqaalBqjGqjat9qWWqVaWFp2mlTaY9pXGmYaU5pimmhad1pV2mTaeZpX2mcaVFpjWngaVpplmlMaWNo22hUaJFo5GhdaJloT2iLaKJo3mhYaJRoYWj+aNloUmiPaFtol2hNaIlooGjcZ1ZnkmflZ19nm2dQZ4xn4GdZZ5VnYmfaZ1RnkGdcZ5lnTmeKZ6Fn3mdXZ5Nm5mZgZv1m2GZSZo5m4WZaZpdmiGZjZp9m3GZVZpFm5GZeZlBmjGbfZlhmlGVhZdllU2WPZeJlXGWYZYploWXdZVZlkmXmZV9l12VRZY1l4GVaZZZkYmTbZFRkkGTkZF1kT2SLZKJk3mRXZJRk52RgZNlkUmSOZOFkW2SXZIlkoGPcY1VjkmPlY15j12NQY4xj32NZY5Vj6GNiY9pjU2OQY+NjXGPVY05jimOhY91iV2KTYuZiX2LYYlFijWLhYlpilmLSYp9i22JVYpFi5GJdYtZiT2KLYt9iWGKUYedhYWHZYVNhj2HiYVthmGHUYYlhoGHdYVZhkmHlYV9h12FQYY1h4GFZYZVh0mDpYGJgnmDaYFRgkGDjYF1g1WBOYItg3mBXYJNg52BgYNhgUmCOYOFgW2CXYNNf6l+gX9xfVV+RX+VfXl/WX1BfjF/fX1hflV/RX+hf2l9TX49f4l9cX5hf1F9OXopeoV7dXlZek17mXl9e2F5RXo1e4F5aXpZe0l7pXp9e215UXpFe5F5dXtZeT16LXd5dWF2UXdBd513ZXVJdjl3iXVtdl13TXepdoF3cXVZdkl3lXdddUF2MXOBcWVyVXNFc6FzaXFRckFzjXFxc1VxOXIpc3VxXXJNc5lzYXFFcjlvhW1pbllvTW+pb21tVW5Fb5FvWW09bjFvfW1hblFvRW+hb2VtTW49a4lpcWtRa61rdWlZaklrlWtdaUVqNWuBaWVqWWtJa6VrbWlRakFnjWV1Z1VlPWYtZ3llXWZRZ51nZWVJZjlnhWVtZ01nqWdxZVViSWOVY1lhQWIxY31hZWJVY0VjoWNpYU1iPWONYXFjUWE5Y61jdV1dXk1fmV9hXUVeNV+FXWleWV9JX6VfbV1VXkVfkV9ZXT1eLV95WWFaUVudW2VZSVo9W4lZbVtRWTVbrVtxWVlaSVuVW11ZQVo1V4FVZVZVV0lXpVdpVVFWQVeNV1VVOVexV3lVXVZNV5lXYVVJVjlThVFpU01TqVNxUVVSRVORU1lRQVN9UWFSVVOhU2lNTU49T4lPUU05T61PdU1ZTklPmU9dTUVONU+BTWlPSU+lSVFKQUuRS1VJPUt5SWFKUUudS2VJSUo5S4lLTUupRVVGSUeVR11FQUYxR31FZUehRU1GQUeNQ1VBOUFdQ5lBRUI5Q01DqUFVQkVDkT09PWE/nT1NPj0/iT9RPTU9WTuVOUU7pTlRO4076Tk5N501STUxNVU3lTFBM6ExTTONMTkxWTOZLUUvpS1RL5EtPSudKUkpNSlZK5Ur8SlBJVElOSP1IUkhMSPtIT0dTR01H/UZRRktGT0VNRfxFUEToRPpETkNRQ09C50L5Qk1BUEH3QUtBTkD4QEw/UD/2Pk4+9z5MPU88TTxQO0s7TjpMOrE6TzlNOEs2TDZVNU40TDNPMlAxTiGmIcYh3SHPIeYgwSDYIFEgySCkIOAguyDSIK0gxB/bH80fqB/kH78f1h+wH+0fxx+iH94euR7QHqse5x7CHp0e2R5SHssepR7iHbwdlx3THa4dTR3qHcUdoB3cHbcdzh2pHeUcwBzXHFAc7hzJHKMc4By6HJUc0RysHOgbwxueG9obtRtUG/EbkBvMG6cb4xuCG74bmRvVG7AbThrsGooaxxqhGt4afBq4GvUakxrPGqoa5hqFGsEanBrYGbMZURnvGY4ZyhmlGeEZfxm8GZYZ0xmtGUwZ6hmIGcQYnxjbGHoYthjyGJEYzRioGEcY5BiDGL8Ymhg4GNYYdRixGE8Y7ReMF8gXoxdBF98XfRe6F5QX0RerF0oX6BeGF8IXnRc8FtkWeBa0FlMW8BaPFssWphZFFuIWgRa9FpgW1BavFk0V6xWKFSgVxhWhFT8V3RV7FbgVkhUxFc8VqRVIFeYVhBUjFcAUmxQ6FNcUdhSyFFEU7hSNFCsUyRSkFEIU4BR/FB0UuxSWEzQT0hNwE60TSxPpE4cTJhPEE54TPRPbE3kTtRPyE5ATLxPMEmsSpxJGEuMSghIhEr4SmRI4EtUSdBISErAS7BKLEikSxxGiEUAR3hF9ERsRuRGUETIR0BFuEasR5xGFESQRwhBgEJwQOxDZEHcQFhCzEPAQjhAtEMoQaRClEEQQ4RCAEB8PvA+XDzYP0w9yD64P6g+JDycPxQ+gDz4O3A57DhkOtw6SDjAOzg5sDqkORw7lDoMOIg7ADV4Nmg05DdcNdQ2xDe4NjA0rDcgNZwyjDEIM3wx+DBwMugyVDDMM0QxwDKwMSgvoC4cLJQvDC2ELngs8C9oLeAsXC7UK8QqPCi4KzApqCqYKRQrjCoEKIAq9CVwJmAk3CdQJcwkSCa8JTgnrCYoIKQjGCGUIoQhACN0IfAgaCLgHVwf0B5MHMQfPB24HDAeqBkgG5gaFBiMGwQZfBv0GnAU6BdgFdgUVBbMFUQTvBI0ELATKBGgDBwOkA0MC4QJ/Ah4Buw==';
  const canvas = document.getElementById('globe');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = () => innerWidth < 700;
  const rad = d => d * Math.PI / 180;

  const raw = atob(LAND); const pts = [];
  for (let i = 0; i < raw.length; i += 2) {
    const lat = raw.charCodeAt(i) / 255 * 180 - 90, lon = raw.charCodeAt(i + 1) / 255 * 360 - 180;
    const gh = lat > 4.3 && lat < 11.4 && lon > -3.4 && lon < 1.4;
    pts.push([rad(lat), rad(lon), gh]);
  }
  const ACCRA = [5.6, -0.19];
  const CITIES = [
    ['London', 51.5, -0.13], ['Copenhagen', 55.7, 12.6], ['Berlin', 52.5, 13.4], ['Dubai', 25.2, 55.3],
    ['New York', 40.7, -74.0], ['Shanghai', 31.2, 121.5], ['Lagos', 6.5, 3.4], ['Johannesburg', -26.2, 28.0],
    ['Abidjan', 5.35, -4.0], ['Toronto', 43.7, -79.4]];
  const NOLABEL = ['Berlin', 'Lagos', 'Abidjan'];
  const MOBILE_CITIES = ['London', 'Copenhagen', 'Dubai', 'New York', 'Johannesburg', 'Lagos'];

  const vec = (lat, lon) => [Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat))];
  function slerp(a, b, t) {
    const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), s = Math.sin(d) || 1;
    const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2, d];
  }
  const arcs = CITIES.map(([name, lat, lon], i) => {
    const a = vec(...ACCRA), b = vec(lat, lon), d = slerp(a, b, 0)[3];
    const steps = 48, path = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, p = slerp(a, b, t), h = 1 + Math.sin(Math.PI * t) * (0.06 + d * 0.16);
      path.push([p[0] * h, p[1] * h, p[2] * h]);
    }
    return { name, lat, lon, path, phase: i * 0.37 };
  });

  let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, lon0 = rad(-8), lat0 = rad(14), t0 = performance.now();
  let dragX = null, dragLon = 0, userLon = 0, running = false, visible = true;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.40; cx = W / 2; cy = H / 2;
    draw(performance.now());
  }
  // world vector -> view (x right, y up, z towards viewer)
  function view(p) {
    const cl = Math.cos(lon0), sl = Math.sin(lon0), ca = Math.cos(lat0), sa = Math.sin(lat0);
    const x1 = p[0] * cl + p[1] * sl, y1 = -p[0] * sl + p[1] * cl, z1 = p[2];
    return [y1, z1 * ca - x1 * sa, z1 * sa + x1 * ca];
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    if (!reduce) lon0 = rad(-8 + Math.sin(t * 0.09) * 26) + userLon;
    ctx.clearRect(0, 0, W, H);

    // atmosphere and body
    const g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.24);
    g.addColorStop(0, 'rgba(64,196,170,.22)'); g.addColorStop(1, 'rgba(64,196,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.24, 0, 7); ctx.fill();
    const b = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    b.addColorStop(0, '#1C2E4A'); b.addColorStop(1, '#0A1424');
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(160,190,230,.18)'; ctx.lineWidth = 1; ctx.stroke();

    // land dots
    const step = small() ? 2 : 1, ds = Math.max(1.1, R / 170);
    for (let i = 0; i < pts.length; i += step) {
      const [la, lo, gh] = pts[i];
      const v = view([Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]);
      if (v[2] <= 0) continue;
      const a = 0.25 + v[2] * 0.7;
      ctx.fillStyle = gh ? `rgba(240,190,90,${Math.min(1, a + .2)})` : `rgba(206,220,240,${a * .78})`;
      const s = (gh ? ds * 1.7 : ds) * (0.6 + v[2] * 0.5);
      ctx.fillRect(cx + v[0] * R - s / 2, cy - v[1] * R - s / 2, s, s);
    }

    // arcs with a travelling light
    const list = small() ? arcs.filter(a => MOBILE_CITIES.includes(a.name)) : arcs;
    ctx.lineCap = 'round';
    for (const arc of list) {
      const P = arc.path.map(view), n = P.length - 1;
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(240,190,90,.28)';
      ctx.beginPath(); let pen = false;
      for (const p of P) { if (p[2] > -0.05) { const X = cx + p[0] * R, Y = cy - p[1] * R; pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true; } else pen = false; }
      ctx.stroke();
      const head = reduce ? 1 : ((t * 0.28 + arc.phase) % 1.4) / 1.2;
      if (head > 0 && head <= 1.05) {
        const h = Math.min(n, Math.round(head * n)), tail = Math.max(0, h - 12);
        for (let k = tail; k < h; k++) {
          const p = P[k], q = P[k + 1]; if (!q || p[2] < 0 || q[2] < 0) continue;
          ctx.strokeStyle = `rgba(110,232,200,${(k - tail) / 12})`; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(cx + p[0] * R, cy - p[1] * R); ctx.lineTo(cx + q[0] * R, cy - q[1] * R); ctx.stroke();
        }
      }
      const end = P[n];
      if (end[2] > 0) {
        const X = cx + end[0] * R, Y = cy - end[1] * R, pulse = reduce ? .6 : (Math.sin(t * 2 + arc.phase * 9) + 1) / 2;
        ctx.fillStyle = `rgba(110,232,200,${.15 + pulse * .2})`; ctx.beginPath(); ctx.arc(X, Y, 3 + pulse * 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#6EE8C8'; ctx.beginPath(); ctx.arc(X, Y, 2.2, 0, 7); ctx.fill();
        if (!small() && end[2] > .35 && !NOLABEL.includes(arc.name)) { ctx.fillStyle = 'rgba(220,230,245,.75)'; ctx.font = '500 11px "Hanken Grotesk",system-ui,sans-serif'; ctx.fillText(arc.name, X + 7, Y + 4); }
      }
    }
    // Accra
    const A = view(vec(...ACCRA));
    if (A[2] > 0) {
      const X = cx + A[0] * R, Y = cy - A[1] * R, p = reduce ? .5 : (Math.sin(t * 2.4) + 1) / 2;
      ctx.fillStyle = `rgba(240,190,90,${.18 + p * .22})`; ctx.beginPath(); ctx.arc(X, Y, 6 + p * 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#F4C66A'; ctx.beginPath(); ctx.arc(X, Y, 3.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '600 12px "Hanken Grotesk",system-ui,sans-serif'; ctx.fillText('Accra', X + 9, Y - 7);
    }
  }

  function loop(now) { if (!running) return; draw(now); requestAnimationFrame(loop); }
  function setRunning(on) {
    on = on && !reduce && visible && !document.hidden;
    if (on === running) return;
    running = on; if (on) requestAnimationFrame(loop);
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; setRunning(true); }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(true));
  // drag to turn (mouse only: on phones a swipe must keep scrolling the page)
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; dragX = e.clientX; dragLon = userLon; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (dragX === null) return; userLon = dragLon - (e.clientX - dragX) / 180; if (!running) draw(performance.now()); });
  canvas.addEventListener('pointerup', () => { dragX = null; });
  resize(); setRunning(true);
})();
